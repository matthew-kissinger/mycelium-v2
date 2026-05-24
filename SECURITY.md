# Security Policy

## Status

This repository is a **frozen Jan-Feb 2026 snapshot**, archived as a reference artifact. It is no longer being developed and no maintenance is committed.

## Reporting

If you find a security issue in the snapshot and want to report it for the historical record, you may use [GitHub Security Advisories](https://github.com/matthew-kissinger/mycelium-v2/security/advisories/new). **There is no response SLA.** Reports may be acknowledged at the maintainer's discretion or not at all.

## Scope

The code as published reflects the design and dependencies of early 2026. Dependencies have evolved since. Anyone using this as reference material should evaluate vulnerabilities against current upstream versions, not the pinned set in this repo.

## What is preserved

- Webhook signature verification scaffolding (HMAC-SHA256)
- No credentials in the repository (and none in history per pre-publication scrub)
- CodeQL configuration retained for historical visibility
