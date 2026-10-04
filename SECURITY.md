# Security policy

## Supported versions

Security fixes target the latest 1.x release. Earlier releases should be upgraded before reporting behavior.

## Reporting

Use GitHub's **Report a vulnerability** under this repository's Security tab when private reporting is enabled. If unavailable, open a minimal issue asking for a private contact channel; do not include exploit details, secrets, or sensitive reports. A response SLA is not currently promised.

## Threat model

Audited URLs and their content are untrusted. The engine validates protocols, credentials, ports, DNS answers, and every HTTP redirect. It pins validated addresses to sockets. Private and special address ranges, including mapped IPv6 addresses, are blocked. DNS, socket requests, response size, redirects, link sample size, and browser resource count are bounded.

The CLI executes JavaScript only with `--browser`. Chromium isolation is not a substitute for a VM/container and outbound firewall. WebRTC or browser-internal traffic may not be covered by HTTP interception. Do not run browser mode with valuable credentials, host filesystem access, or internal-network reachability. The web API never enables browser mode.

The production API requires a bearer token and caps concurrent audits per process. This is not a distributed rate limiter. Put hosted deployments behind TLS, identity access controls, bounded request bodies, shared rate limits, egress restrictions, and resource limits. The service is designed for trusted developer use, not anonymous unlimited public auditing. Avoid exposing development servers to the internet.

Reports can include sensitive page text and URLs. Review before publishing. JSON exports are not sanitized for insertion into HTML; use text rendering. The dashboard escapes evidence through React. No target credentials or cookies are forwarded. Public proxies and public endpoints can themselves reach private resources; application URL filtering cannot control what a remote server does.

Only audit sites you are authorized to inspect. Respect destination policies and avoid aggressive repeated requests. Sitecheck discovers robots.txt but does not implement crawler policy enforcement.
