# Security policy

8Domains is a CISSP study app. Reports are welcome and taken seriously.

## Reporting a vulnerability

Report privately, never in a public issue:

- GitHub: [open a private advisory](https://github.com/fennih/8domains/security/advisories/new)
- Email: security@valerio.fyi

Include what you found, how to reproduce it and what an attacker could do with it. English or Italian.

You will get an acknowledgement within 3 days and a status update within 14. Fixes are credited in the advisory unless you prefer otherwise. There is no bug bounty.

## Scope

In scope:

- https://8domains.valerio.fyi: the landing page and the app under `/app/`
- The Cloudflare Worker in `worker/` (session gate, security headers)
- The build pipeline and the content in this repository

Out of scope:

- Vulnerabilities in Clerk or Cloudflare themselves: report them to those vendors
- The sign-in pages on `accounts.8domains.valerio.fyi`, which Clerk hosts, unless the issue comes from this project's configuration
- Missing best-practice headers or settings without a demonstrated impact
- Denial of service and volumetric testing; please do not run them against the live site
- Social engineering

## Safe harbor

Good-faith research that stays in scope, avoids other people's accounts and data, and gives reasonable time to fix before disclosure will not lead to any complaint or legal action.
