import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import { z } from 'zod';
import { AuditError } from './types.js';

export function validateUrl(input: string): URL {
  if (!z.string().url().max(2048).safeParse(input).success)
    throw new AuditError('Enter a full public HTTP(S) URL.', 'INVALID_URL');
  const url = new URL(input);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port))
  )
    throw new AuditError(
      'Only HTTP(S), standard ports, and URLs without credentials are supported.',
      'INVALID_URL',
    );
  url.hash = '';
  return url;
}
export function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}
export async function resolvePublic(
  url: URL,
): Promise<{ address: string; family: number }> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const records = await lookup(hostname, { all: true });
  if (!records.length || records.some((r) => !isPublicAddress(r.address)))
    throw new AuditError(
      'Private, loopback, reserved, and mixed public/private destinations are blocked.',
      'BLOCKED_URL',
    );
  return records[0]!;
}
export interface HttpResult {
  url: string;
  status: number;
  body: string;
  bytes: Buffer;
  contentType: string;
  responseTimeMs: number;
}
export async function requestPublic(
  input: string,
  timeoutMs = 10000,
  maxBytes = 2_000_000,
  method: 'GET' | 'HEAD' = 'GET',
  redirects = 0,
): Promise<HttpResult> {
  const url = validateUrl(input);
  const started = performance.now();
  let record: { address: string; family: number };
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    record = await Promise.race([
      resolvePublic(url),
      new Promise<never>((_resolve, reject) => {
        dnsTimer = setTimeout(
          () => reject(new AuditError('DNS resolution timed out.', 'NETWORK')),
          timeoutMs,
        );
      }),
    ]);
  } catch (e) {
    if (e instanceof AuditError) throw e;
    throw new AuditError('Could not resolve the destination.', 'NETWORK');
  } finally {
    clearTimeout(dnsTimer);
  }
  const result = await new Promise<HttpResult & { location?: string }>(
    (resolve, reject) => {
      const transport = url.protocol === 'https:' ? https : http;
      // Pin the validated DNS answer to the socket; a second lookup would permit rebinding.
      const req = transport.request(
        url,
        {
          method,
          family: record.family,
          headers: {
            'user-agent':
              'Sitecheck/1.0 (+https://github.com/bynowak/sitecheck)',
            accept: 'text/html,application/xml,text/plain;q=0.9',
          },
          lookup: (_host, _options, callback) =>
            callback(null, record.address, record.family),
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) {
              req.destroy(
                new AuditError(
                  'Response exceeds the configured size limit.',
                  'LIMIT',
                ),
              );
            } else chunks.push(chunk);
          });
          res.on('error', reject);
          res.on('end', () => {
            const bytes = Buffer.concat(chunks);
            resolve({
              url: url.href,
              status: res.statusCode ?? 0,
              body: bytes.toString('utf8'),
              bytes,
              contentType: res.headers['content-type'] ?? '',
              responseTimeMs: Math.round(performance.now() - started),
              ...(res.headers.location
                ? { location: res.headers.location }
                : {}),
            });
          });
        },
      );
      const timer = setTimeout(
        () => req.destroy(new AuditError('Request timed out.', 'NETWORK')),
        Math.max(1, timeoutMs - (performance.now() - started)),
      );
      req.on('close', () => clearTimeout(timer));
      req.on('error', (e) =>
        reject(
          e instanceof AuditError
            ? e
            : new AuditError(
                'The destination could not be reached.',
                'NETWORK',
              ),
        ),
      );
      req.end();
    },
  );
  if ([301, 302, 303, 307, 308].includes(result.status) && result.location) {
    if (redirects >= 5) throw new AuditError('Too many redirects.', 'NETWORK');
    const remaining = timeoutMs - (performance.now() - started);
    if (remaining <= 0) throw new AuditError('Request timed out.', 'NETWORK');
    const next = await requestPublic(
      new URL(result.location, url).href,
      remaining,
      maxBytes,
      method,
      redirects + 1,
    );
    return { ...next, responseTimeMs: Math.round(performance.now() - started) };
  }
  return result;
}
