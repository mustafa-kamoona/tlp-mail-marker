# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- Firefox desktop 140+ build with shared Roundcube marking, settings and
  organisation profiles, event background, stable ID and no-data-collection
  declaration. Private unsigned ZIP and checksum.
- Native Firefox stable/ESR acceptance tests, Mozilla manifest validation,
  and required Firefox CI for dependency auto-merging.

## 0.3.2 - 2026-10-09

### Fixed

- Serialize browser script registration across permission, settings and popup
  events. Overlapping events no longer try to register the same script ID twice,
  and disabling or removing a host waits for an in-flight registration before
  unregistering it.
- Add regression tests for overlapping registration, disabling, host removal
  and recovery after an API failure.

## 0.2.0 - 2026-10-09 (private beta)

### Added

- Portable organisation profiles with explicit preview/import/export in both
  clients: approved levels, new-message default and missing-label rule.
- Approved-level and default controls in both settings pages; administrator
  policy continues to take priority in the browser.
- Private beta installation/checklist pack and checksums for browser ZIP and XPI.
- Native Windows CI, inline-image SMTP verification, native OpenPGP delivery
  with signature/decryption checks, and encrypted IMAP draft acceptance tests.

- Separate Thunderbird 140+ MailExtension build in the same repository, sharing
  the TLP core: compose-toolbar selector, local settings, plain/HTML marking,
  optional source-message detection, native send reviews and a private XPI.
- Native Thunderbird runtime tests with a disposable profile and loopback-only
  synthetic SMTP; Thunderbird CI is required for dependency auto-merging.

- Send-time warning when quoted text (lines starting with `>`, or HTML
  blockquotes) carries a more restrictive TLP label than the selected one, even
  when the subject says otherwise. Controlled by "Warn on downgrade".

### Fixed

- Send-time checks reject a level removed from the approved list while a
  composer is open.

- `TLP:AMBER STRICT` and `TLP:AMBER-STRICT` are now read as `TLP:AMBER+STRICT`
  instead of plain `TLP:AMBER`, so the STRICT modifier is no longer silently
  dropped or left behind as stray text in the subject.
- Re-marking a subject no longer deletes a `TLP:xxx` that is part of the
  subject's wording; only bracketed tokens and leading/trailing bare tokens are
  treated as marks.
- Token detection and stripping share one pattern; `FOOTLP:RED` is no longer a
  token that detection sees but stripping cannot remove.
- The reply/forward downgrade baseline is the level detected when the composer
  opened, not whatever the user had selected when the environment probe fired.
- The late-probe preselection note uses the localised message.

## 0.1.0 - 2026-10-08

### Added

- FIRST TLP 2.0 classification engine with the five canonical levels
  (`TLP:CLEAR`, `TLP:GREEN`, `TLP:AMBER`, `TLP:AMBER+STRICT`, `TLP:RED`) and
  recognised, non-emitted legacy `TLP:WHITE`.
- Subject and body marking for plain-text and HTML (TinyMCE) Roundcube
  composers, with idempotent transforms that preserve signatures, quotes, links
  and attachments.
- Existing-classification detection and reply/forward preselection, with
  documented downgrade warnings and never a silent downgrade.
- Synchronous send-time validation with configurable block/warn/off policy,
  subject↔body agreement checks, duplicate/conflict detection and a
  MAIN-world probe for composer intent.
- Accessible TLP selector (shadow DOM, native radio semantics, tooltips,
  light/dark themes, colour never the only signal).
- Debounced composer scanner and per-element attachment flags.
- Options page for per-domain authorisation, mandatory classification,
  downgrade warnings and visual preferences.
- Enterprise managed policy (`chrome.storage.managed`) with a published schema:
  administrators can lock settings, restrict levels, set a default, manage
  hosts and grant host access (`docs/ENTERPRISE.md`).
- Localised UI (English, French, German) via `_locales`, with canonical TLP
  labels preserved and an English fallback for every key.
- Action popup with quick per-site authorisation and a TLP legend.
- Unit, integration and real-browser end-to-end tests (Roundcube + GreenMail +
  Playwright).
- Documentation: README, privacy policy, security policy and review,
  architecture, research notes, compatibility matrix, testing guide and Chrome
  Web Store materials.
- GitHub Actions CI workflow and a packaging script.

### Security

- No telemetry, analytics, external APIs, remote code or dynamic evaluation.
- Per-domain optional host permissions; no broad access at install.
- No storage of email content.
- Adversarial incoming HTML is treated as untrusted text and never rendered.
