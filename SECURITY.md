# Security Policy

## Supported versions

Only the latest released version receives security fixes.

| Version | Supported |
| --- | --- |
| 0.1.x | :white_check_mark: |
| older | :x: |

## Reporting a vulnerability

Please report suspected vulnerabilities **privately**. Do not open a public
issue for a security problem.

Contact the maintainer through an existing private channel to arrange disclosure.
If GitHub **private vulnerability reporting** is available for the repository,
use "Report a vulnerability" under its *Security* tab.

Please include:

- a description of the issue and its impact,
- the affected version and environment,
- reproduction steps or a proof of concept using **synthetic** data only,
- any suggested remediation.

**Never** send real email content, credentials, or personal data. Use synthetic
messages.

## What to expect

- Acknowledgement within 5 working days.
- An initial assessment within 10 working days.
- Coordinated disclosure: we will agree a disclosure date with you and credit
  you unless you prefer otherwise.

## Scope

In scope:

- the extension's own code (`src/`), build scripts and published package;
- permission and privacy behaviour;
- injection/integrity issues in the injected UI or markings;
- ways an extension page, content script, or the MAIN-world probe could be
  abused by a malicious or compromised webmail page.

Out of scope:

- vulnerabilities in Roundcube Webmail itself (report those to the Roundcube
  project);
- the fact that **browser-side validation can be bypassed** — this is a known,
  documented limitation, not a vulnerability;
- social engineering and physical access;
- issues that require an already fully compromised browser or OS.

## Design boundaries

TLP Mail Marker is an assistive composition tool. It is **not** a DLP system,
not encryption, and not access control. TLP is an information-sharing protocol.
It does not, and does not claim to, enforce information handling.

## Hardening notes

- No telemetry, analytics, external APIs or remote code.
- No email content is stored.
- Host access is optional and per-domain; there is no broad access at install.
- See [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md) for the internal
  review and remediations.
