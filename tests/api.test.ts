import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('../packages/engine/dist/index.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../packages/engine/dist/index.js')>();
  return { ...original, audit: vi.fn() };
});
import { audit, AuditError } from '../packages/engine/dist/index.js';
import { POST } from '../apps/web/app/api/audit/route.js';
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
const request = (body: string, token?: string) =>
  new Request('https://sitecheck.example/api/audit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
describe('dashboard API', () => {
  it('fails closed when production authentication is unconfigured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SITECHECK_API_TOKEN', '');
    expect((await POST(request('{}'))).status).toBe(503);
    expect(audit).not.toHaveBeenCalled();
  });
  it('rejects a wrong token', async () => {
    vi.stubEnv('SITECHECK_API_TOKEN', 'test-token');
    expect((await POST(request('{}', 'wrong'))).status).toBe(401);
    expect(audit).not.toHaveBeenCalled();
  });
  it('accepts a valid token and uses bounded HTML inspection', async () => {
    vi.stubEnv('SITECHECK_API_TOKEN', 'test-token');
    vi.mocked(audit).mockResolvedValue({ schemaVersion: 1 } as never);
    const response = await POST(
      request('{"url":"https://example.com"}', 'test-token'),
    );
    expect(response.status).toBe(200);
    expect(audit).toHaveBeenCalledWith('https://example.com', {
      maxLinks: 10,
      timeoutMs: 5000,
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects large streaming bodies without relying on content-length', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SITECHECK_API_TOKEN', '');
    expect((await POST(request('x'.repeat(4097)))).status).toBe(413);
    expect(audit).not.toHaveBeenCalled();
  });
  it.each(['{', '{}', '{"url":"https://example.com","browser":true}'])(
    'rejects invalid input %s',
    async (body) => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('SITECHECK_API_TOKEN', '');
      expect((await POST(request(body))).status).toBe(400);
    },
  );
  it('returns actionable audit errors', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SITECHECK_API_TOKEN', '');
    vi.mocked(audit).mockRejectedValue(
      new AuditError('Private destination blocked', 'BLOCKED_URL'),
    );
    const response = await POST(request('{"url":"http://localhost"}'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Private destination blocked',
    });
  });
});
