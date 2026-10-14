# Security policy

DBIM Validator fetches URLs supplied by users, so server-side request forgery (SSRF) is the main risk when it is hosted publicly. The scanner rejects URLs that resolve to private or reserved addresses and blocks such addresses for every request the browser makes. Lighthouse runs its own Chrome and only blocks well-known internal hostnames, so run the worker in a network-isolated environment in production.

## Reporting a vulnerability

Please don't open a public issue for security problems. Report them privately through [GitHub security advisories](https://github.com/tejash-jl/dbim-validator/security/advisories/new). You can expect a reply within a week.
