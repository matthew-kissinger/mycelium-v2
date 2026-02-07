# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in mycelium-v2, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please use one of the following methods:

1. **GitHub Security Advisories**: Use the [Security tab](https://github.com/matthew-kissinger/mycelium-v2/security/advisories/new) to privately report a vulnerability.

2. **Email**: Contact the maintainer directly at the email associated with this GitHub account.

## What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 1 week
- **Fix**: Depends on severity, but we aim for patches within 2 weeks for critical issues

## Scope

This policy applies to the mycelium-v2 codebase. Issues in dependencies should be reported to the respective upstream projects.

## Security Features

- Webhook signature verification (HMAC-SHA256)
- No credentials stored in the repository
- Dependabot automated dependency updates
- CodeQL code scanning on push and PRs
- Secret scanning with push protection (public repos)
