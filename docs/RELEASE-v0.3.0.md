# v0.3.0 — Firefox private beta

Adds Firefox desktop 140+ alongside the Chromium extension and Thunderbird
add-on, sharing the existing TLP engine and organisation profiles. The repository
remains private. No public listing or Mozilla signing has been performed.

- Separate unsigned Firefox ZIP and checksum, event background and stable ID.
- No data collection; site access requires explicit user consent.
- Shared marking, reply/forward reviews, settings and profile import/export.
- Native Firefox stable/ESR CI against synthetic Roundcube, including actual
  delivery and blocked-send read-back. Both jobs gate dependency auto-merging.

Follow `FIREFOX.md` for temporary installation. Permanent installation in
standard Firefox requires Mozilla signing; unlisted submission is a separate
decision. Other installation steps are in `BETA-TESTING.md`. Executed tests
and limitations are recorded in `COMPATIBILITY.md`.

Existing limits remain: browser checks are bypassable; manual Thunderbird
keyboard/settings acceptance, S/MIME and production IMAP are pending. Firefox
Android and administrator policy provisioning are untested. This is a composition
aid, not DLP or a server enforcement product.
