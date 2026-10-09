# v0.2.0 — private beta

Adds a native Thunderbird add-on alongside the Roundcube browser extension,
with a shared FIRST TLP 2.0 core and portable organisation profiles. This is a
GitHub prerelease; the repository and release remain private.

- Thunderbird compose selector, plain/HTML marking, original-message checks
  with optional access, one-shot send reviews and configurable missing-label
  behaviour.
- Profile preview/import/export in both clients: approved levels, default and
  missing-classification rule. Browser administrator policy takes priority.
- Send-time rejection of levels removed by a profile while a draft is open.
- Expanded native tests for inline images, signed/encrypted OpenPGP and IMAP
  draft round-tripping; Windows native runtime CI is required for auto-merging.
- Parser and quoted-thread fixes listed in `CHANGELOG.md`.

Install the browser ZIP or Thunderbird XPI following `BETA-TESTING.md`.
Verify the included checksums. Test synthetic mail first. Keep the packages
private and use the compatibility matrix for exactly what has been executed.

Validation: 224 unit/integration tests, 41 dependency auto-merge checks,
15 real-browser Roundcube scenarios, and native Thunderbird 140.17.0 ESR on
macOS/Linux (20 checks each) and Windows (18, without the optional IMAP fixture).
The dependency audit found zero vulnerabilities.

Known gaps: manual Thunderbird keyboard/settings acceptance is pending;
the toolbar picker opened, but native automation lost popup focus and screen
capture failed after the Mac was unlocked. S/MIME, newer Thunderbird
versions and production IMAP servers remain untested. Thunderbird controls and
profile controls currently use English. This is a composition aid, not DLP.

Prior art: [TLP 2.0 - Classification](https://addons.thunderbird.net/en-US/thunderbird/addon/tlp-2-0-classification/)
by Michael Stern is independently authored. No code or assets from that add-on
are included. See `docs/RESEARCH.md` for attribution.
