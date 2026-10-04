import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
import { lookup } from 'node:dns/promises';
import {
  isPublicAddress,
  resolvePublic,
  validateUrl,
  requestPublic,
} from '../packages/engine/src/network.js';
afterEach(() => vi.resetAllMocks());
describe('URL security', () => {
  it.each([
    'file:///etc/passwd',
    'ftp://example.com',
    'http://user:pass@example.com',
    'http://example.com:8080',
    'not a url',
  ])('rejects %s', (url) => expect(() => validateUrl(url)).toThrow());
  it('normalizes a public URL', () =>
    expect(validateUrl('https://example.com/#anchor').href).toBe(
      'https://example.com/',
    ));
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '192.0.2.1',
    '2001:db8::1',
  ])('blocks %s', (ip) => expect(isPublicAddress(ip)).toBe(false));
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'allows public %s',
    (ip) => expect(isPublicAddress(ip)).toBe(true),
  );
  it('rejects mixed public and private DNS answers', async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ] as never);
    await expect(
      resolvePublic(new URL('https://example.com')),
    ).rejects.toMatchObject({ code: 'BLOCKED_URL' });
  });
  it('never opens a socket for a private destination', async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: '127.0.0.1', family: 4 },
    ] as never);
    await expect(requestPublic('http://localhost')).rejects.toMatchObject({
      code: 'BLOCKED_URL',
    });
  });
});
