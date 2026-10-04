# Contributing

Thank you for improving Sitecheck. Report reproducible bugs or propose focused enhancements using the issue templates. Discuss new dependencies, crawling features, and score policy changes before implementation.

## Local checks

Use Node.js 22+ and pnpm 10.28.2. Install with `pnpm install --frozen-lockfile`, then run `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`. Run `pnpm format` before submitting.

## Rules and tests

Rules belong in the engine and must include a stable ID, title, category, severity, explanation, recommendation, and bounded evidence. Distinguish failures from unevaluated checks. Explain heuristic thresholds and avoid claims of WCAG certification or guaranteed rankings. Add minimal HTML fixtures and deterministic tests. Mock outbound traffic; never depend on changing public sites. Cover false positives as well as failures. Do not weaken URL validation for convenience.

## Pull requests

Use a branch such as `feat/your-change` and conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Explain the problem, behavior, and verification. Keep unrelated changes out. Follow the MIT license and code of conduct. Maintainers review security-sensitive changes and schema compatibility explicitly.

For security vulnerabilities, follow SECURITY.md instead of opening a public issue.
