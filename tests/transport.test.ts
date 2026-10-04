import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('node:https', () => ({ default: { request: vi.fn() } }));
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { requestPublic } from '../packages/engine/src/network.js';
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});
function serve(
  status: number,
  body: string,
  headers: Record<string, string> = {},
) {
  vi.mocked(https.request).mockImplementationOnce((...args: unknown[]) => {
    const callback = args[2] as (
      response: EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
      },
    ) => void;
    const req = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error: Error) => void;
    };
    req.destroy = (error) => {
      req.emit('error', error);
      req.emit('close');
    };
    req.end = () => {
      const response = Object.assign(new EventEmitter(), {
        statusCode: status,
        headers: { 'content-type': 'text/html', ...headers },
      });
      callback(response);
      response.emit('data', Buffer.from(body));
      response.emit('end');
      req.emit('close');
    };
    return req as never;
  });
}
describe('DNS-pinned HTTP transport', () => {
  it('pins the validated address and socket family', async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: '8.8.8.8', family: 4 },
    ] as never);
    serve(200, 'hello');
    const response = await requestPublic('https://example.com');
    expect(response.body).toBe('hello');
    const options = vi.mocked(https.request).mock
      .calls[0]![1] as https.RequestOptions;
    expect(options.family).toBe(4);
    const callback = vi.fn();
    if (typeof options.lookup === 'function')
      options.lookup('example.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
  });
  it('revalidates redirects and blocks a private redirect before connecting', async () => {
    vi.mocked(lookup)
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }] as never)
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as never);
    serve(302, '', { location: 'https://localhost/' });
    await expect(requestPublic('https://example.com')).rejects.toMatchObject({
      code: 'BLOCKED_URL',
    });
    expect(https.request).toHaveBeenCalledTimes(1);
  });
  it('limits redirects', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
    ] as never);
    for (let i = 0; i < 6; i++) serve(302, '', { location: '/again' });
    await expect(requestPublic('https://example.com')).rejects.toThrow(
      'Too many redirects',
    );
    expect(https.request).toHaveBeenCalledTimes(6);
  });
  it('limits response bytes', async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: '8.8.8.8', family: 4 },
    ] as never);
    serve(200, 'too large');
    await expect(
      requestPublic('https://example.com', 1000, 2),
    ).rejects.toMatchObject({ code: 'LIMIT' });
  });
  it('times out stalled DNS', async () => {
    vi.useFakeTimers();
    vi.mocked(lookup).mockImplementationOnce(
      () => new Promise(() => {}) as never,
    );
    const promise = requestPublic('https://example.com', 1000);
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'NETWORK',
    });
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    expect(https.request).not.toHaveBeenCalled();
  });
});
