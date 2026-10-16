# Security policy

DBIM Validator fetches URLs supplied by users, so server-side request forgery (SSRF) is the main risk when it is hosted publicly. In production (`npm start`) the scanner rejects URLs that resolve to private or reserved addresses and blocks such addresses for every request the browser makes. Scanning localhost and private networks is allowed only in development and the CLI, or when `ALLOW_PRIVATE_URLS=1` is set; never set it on a public server. The server decides this per scan; a request can't turn it on. Lighthouse runs its own Chrome and only blocks well-known internal hostnames, so run the worker in a network-isolated environment in production.

## Reporting a vulnerability

Please don't open a public issue for security problems. Report them privately through [GitHub security advisories](https://github.com/tejash-jl/dbim-validator/security/advisories/new). You can expect a reply within a week.
