import { audit, AuditError } from '@sitecheck/engine';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
export const runtime = 'nodejs';
const schema = z.object({ url: z.string().max(2048) }).strict();
let active = 0;
export async function POST(req: Request): Promise<Response> {
  const token = process.env.SITECHECK_API_TOKEN;
  if (process.env.NODE_ENV === 'production' && !token)
    return Response.json(
      { error: 'Configure SITECHECK_API_TOKEN before exposing this server.' },
      { status: 503 },
    );
  if (token) {
    const supplied = Buffer.from(
      req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '',
    );
    const expected = Buffer.from(token);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return Response.json(
        { error: 'A valid API token is required.' },
        { status: 401 },
      );
  }
  if (active >= 2)
    return Response.json(
      { error: 'Audit capacity reached. Try again shortly.' },
      { status: 429 },
    );
  if (Number(req.headers.get('content-length') ?? 0) > 4096)
    return Response.json({ error: 'Request too large.' }, { status: 413 });
  active++;
  try {
    const reader = req.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return Response.json(
            { error: 'Request too large.' },
            { status: 413 },
          );
        }
        chunks.push(chunk.value);
      }
    }
    const text = Buffer.concat(chunks).toString('utf8');
    const body = schema.safeParse(JSON.parse(text));
    if (!body.success)
      return Response.json({ error: 'Provide a URL.' }, { status: 400 });
    return Response.json(
      await audit(body.data.url, { maxLinks: 10, timeoutMs: 5000 }),
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AuditError
            ? e.message
            : 'Unable to process this request.',
      },
      {
        status: e instanceof AuditError || e instanceof SyntaxError ? 400 : 500,
      },
    );
  } finally {
    active--;
  }
}
