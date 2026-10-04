#!/usr/bin/env node
import { Command, CommanderError, InvalidArgumentError } from 'commander';
import { writeFile } from 'node:fs/promises';
import { audit, AuditError, type AuditReport } from '@sitecheck/engine';
export function formatReport(report: AuditReport): string {
  return [
    `Sitecheck · Know what ships.`,
    report.finalUrl,
    `Score: ${report.score}/100`,
    ...Object.entries(report.scores).map(
      ([name, score]) => `  ${name}: ${score ?? 'not evaluated'}`,
    ),
    '',
    ...report.findings
      .filter((f) => f.status !== 'pass')
      .map(
        (f) =>
          `[${f.status === 'skip' ? 'SKIP' : f.severity.toUpperCase()}] ${f.title}\n  ${f.evidence.join('; ')}\n  → ${f.recommendation}`,
      ),
    '',
    ...report.limitations,
  ].join('\n');
}
const integer = (value: string) => {
  if (!/^\d+$/.test(value))
    throw new InvalidArgumentError('Expected a non-negative integer.');
  return Number(value);
};
const cli = new Command()
  .exitOverride()
  .name('sitecheck')
  .description('Know what ships. Audit a public website.')
  .version('1.0.0')
  .argument('<url>', 'Public HTTP(S) page')
  .option('--format <format>', 'text or json', 'text')
  .option(
    '-o, --output <path>',
    'Write the report; .json selects JSON unless --format is explicit',
  )
  .option('--browser', 'Inspect rendered HTML and browser errors')
  .option('--max-links <count>', 'Link sample size, 0–100', integer, 20)
  .option('--timeout <ms>', 'Per-request timeout, 1000–30000', integer, 10000)
  .option('--fail-under <score>', 'Exit 1 below this score', integer, 0)
  .action(
    async (
      url: string,
      opts: {
        format: string;
        output?: string;
        browser?: boolean;
        maxLinks: number;
        timeout: number;
        failUnder: number;
      },
    ) => {
      if (!['text', 'json'].includes(opts.format) || opts.failUnder > 100)
        throw new AuditError(
          'Use --format text|json and --fail-under 0–100.',
          'INVALID_URL',
        );
      const report = await audit(url, {
        browser: !!opts.browser,
        maxLinks: opts.maxLinks,
        timeoutMs: opts.timeout,
      });
      const json =
        opts.format === 'json' ||
        (opts.output?.endsWith('.json') &&
          cli.getOptionValueSource('format') === 'default');
      const output = json
        ? JSON.stringify(report, null, 2)
        : formatReport(report);
      if (opts.output)
        await writeFile(opts.output, output + '\n', {
          encoding: 'utf8',
          flag: 'wx',
        });
      else process.stdout.write(output + '\n');
      if (report.score < opts.failUnder) process.exitCode = 1;
    },
  );
try {
  await cli.parseAsync();
} catch (e) {
  if (e instanceof CommanderError) {
    process.exitCode = e.exitCode === 0 ? 0 : 2;
  } else {
    process.stderr.write(
      `sitecheck: ${e instanceof AuditError ? `[${e.code}] ` : ''}${e instanceof Error ? e.message : 'Audit failed'}\n`,
    );
    process.exitCode = 2;
  }
}
