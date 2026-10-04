# Releasing Sitecheck

1. Review breaking API/schema and scoring changes. Update all package versions and CHANGELOG.md.
2. Run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` on a clean checkout.
3. Review packed files, licensing, lockfile changes, screenshots, and security changes.
4. Commit with `chore: release vX.Y.Z`, then tag `vX.Y.Z` and push the tag.
5. The release workflow repeats verification and creates a GitHub release with engine and CLI tarballs. Workspace dependencies are rewritten by pnpm during packing; tarballs are for inspection and future registry publishing, not a standalone self-contained binary.

The v1 distribution is source-first. npm publishing is intentionally disabled until ownership of the package names is confirmed. Future npm publication should use trusted publishing/OIDC, provenance, protected environments, and a reviewed release process. Never put npm tokens in repository files.

For a source-first release without local GitHub credentials, open Actions → Release → Run workflow on the reviewed branch and enter `vX.Y.Z`. The workflow verifies the source, creates the tag at that commit, and publishes the release with package archives. Only stable semantic-version tags are accepted. An existing release is not overwritten.
