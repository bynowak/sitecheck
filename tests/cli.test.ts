import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
const cli = fileURLToPath(
  new URL('../packages/cli/dist/index.js', import.meta.url),
);
describe('CLI exit contract', () => {
  it('prints documented help with success status', () => {
    const result = spawnSync(process.execPath, [cli, '--help'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--fail-under');
    expect(result.stdout).toContain('--browser');
  });
  it.each(
    [
      [],
      ['--unknown'],
      ['https://example.com', '--max-links', 'nope'],
      ['file:///etc/passwd'],
      ['https://example.com', '--format', 'yaml'],
    ].map((args) => ({ args })),
  )('uses status 2 for invalid arguments $args', ({ args }) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(2);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});
