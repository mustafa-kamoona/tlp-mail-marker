# v0.3.0 — Firefox private beta

Adds Firefox desktop 140+ alongside the Chromium extension and Thunderbird
add-on, sharing the existing TLP engine and organisation profiles. The repository
remains private. Mozilla approved and signed the Firefox package for unlisted
self-distribution on 2026-10-09; there is no public store listing.

- Separate unsigned Firefox ZIP and checksum, event background and stable ID.
- Mozilla-signed Firefox XPI for permanent installation, with a separate checksum.
- No data collection; site access requires explicit user consent.
- Shared marking, reply/forward reviews, settings and profile import/export.
- Native Firefox stable/ESR CI against synthetic Roundcube, including actual
  delivery and blocked-send read-back. Both jobs gate dependency auto-merging.

Follow `FIREFOX.md` to install the signed XPI permanently or load a locally
built unsigned ZIP temporarily. Other installation steps are in
`BETA-TESTING.md`. Executed tests
and limitations are recorded in `COMPATIBILITY.md`.

Existing limits remain: browser checks are bypassable; manual Thunderbird
keyboard/settings acceptance, S/MIME and production IMAP are pending. Firefox
Android and administrator policy provisioning are untested. This is a composition
aid, not DLP or a server enforcement product.
