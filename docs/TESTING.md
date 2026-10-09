# Testing

## Thunderbird native tests

Build with `npm run build:thunderbird` and `npm run package:thunderbird`, then
set `THUNDERBIRD_BINARY` and run
`npm run e2e:thunderbird`. The executable starts with a new temporary profile,
synthetic accounts, and a loopback-only SMTP server. This does not use a personal
mailbox. On Linux run it under `xvfb-run -a`.

The runner installs a temporary copy of the production bundle with a test-only
driver, reporting experiment and extra automation permissions. They are absent
from `dist-thunderbird` and the shipped XPI. Native marking, draft operations,
source-message inheritance and sending are exercised through Thunderbird APIs;
SMTP capture independently checks approved delivery and cancelled/blocking sends.
Reports and diagnostics appear in `tests/thunderbird/artifacts/`. See
[compatibility](COMPATIBILITY.md) for executed versions and manual coverage limits.

## Firefox native tests

Build/package with `npm run build:firefox` and `npm run package:firefox`. Start
the synthetic fixture with `docker compose -f tests/e2e/docker-compose.yml up -d`,
then run `FIREFOX_BINARY=/path/to/firefox npm run e2e:firefox`. Stop the fixture
after testing with `docker compose -f tests/e2e/docker-compose.yml down -v`.
The disposable profile loads the unmodified production ZIP and tests real
Roundcube composition, permission consent/revocation and SMTP delivery via
independent mailbox read-back. Reports/logs are in `tests/firefox/artifacts/`.
Use `FIREFOX_ARTIFACTS` to preserve reports from separate Firefox versions.

TLP Mail Marker has five test layers. All use **synthetic data only**; no
production accounts or real messages are ever accessed.

## Summary

| Layer | Framework | Environment | Location |
| --- | --- | --- | --- |
| Unit | Vitest | Node | `tests/unit` |
| Integration | Vitest + jsdom | Simulated Roundcube DOM and Thunderbird APIs | `tests/integration` |
| End-to-end | Playwright + Docker | Real Chromium + real Roundcube | `scripts/e2e`, `tests/e2e` |
| Native end-to-end | Marionette + temporary test driver | Real Thunderbird + synthetic SMTP | `tests/thunderbird` |
| Native browser end-to-end | Marionette, unmodified production ZIP | Real Firefox + Roundcube + synthetic IMAP/SMTP | `tests/firefox` |

## Unit tests

Pure logic, no browser:

```sh
npm run test:unit
```

Covers the TLP model, token parser, subject/plain marking, policy and
preselection, pre-send validation, settings normalisation and domain handling,
and the HTML marking engine (under jsdom).

## Integration tests

```sh
npm run test:integration
```

- `tests/integration/roundcube-adapter.test.ts` — composer detection, plain and
  rich-text bodies, mode changes, control detection, intent.
- `tests/integration/composer-controller.test.ts` — selector injection, marking,
  send interception (block/warn/allow), mismatch handling, reply preselection,
  downgrade confirmation, mode switching, clearing.
- `tests/integration/scanner.test.ts` — debounced scanner attach/detach/refresh
  and single-attachment.

Fixtures (`tests/integration/fixture.ts`) reproduce the stable Roundcube
composer contract. They are not a substitute for the browser suite.

Run everything:

```sh
npm test
```

## End-to-end tests

```sh
npm run e2e
```

The runner (`scripts/e2e/run.mjs`):

1. starts a real **Roundcube 1.6.19** (Docker, SQLite) and **GreenMail 2.1.0**
   IMAP/SMTP via `tests/e2e/docker-compose.yml` (unless `ROUNDCUBE_URL` is
   already reachable);
2. builds the `e2e` extension variant, which additionally registers the content
   scripts statically for `localhost` / `127.0.0.1`;
3. launches Chromium with the extension loaded (Playwright `channel: chromium`);
4. seeds authorised settings through the service worker;
5. logs in as a synthetic user, drives the real composer, and injects incoming
   messages over IMAP for reply/forward tests;
6. writes `tests/e2e/artifacts/report.json` and screenshots;
7. tears the stack down.

Requirements: Docker and network access to pull `roundcube/roundcubemail:1.6.19-apache`
and `greenmail/standalone:2.1.0`.

### Why a dev-only content-script registration?

Production registers content scripts dynamically, only for hosts the user
authorises. In the test environment the browser permission prompt cannot be
driven headlessly, so the `e2e` build adds a static registration for
`localhost` / `127.0.0.1`. All other code paths are identical to production; the
dynamic-registration logic is exercised by review and by the service-worker
reconciliation code.

## Manual smoke test (recommended before release)

1. `npm run build`, load `dist/` unpacked.
2. Add a real Roundcube host in Settings and approve the prompt.
3. Compose new / reply / forward in plain and HTML; select each level; save and
   reopen a draft; reload; verify subject, body, signatures and quotes.
4. Verify the popup legend and the keyboard/screen-reader behaviour of the
   selector.

## Continuous integration

`.github/workflows/ci.yml` runs type checking, unit + integration tests, and a
production build on every push and pull request. The browser E2E job is
separate because it needs Docker; see the workflow for how to enable it.

## Interpreting results

Do not claim a behaviour is verified unless the corresponding test ran in the
relevant environment. The matrix in [`COMPATIBILITY.md`](COMPATIBILITY.md)
records exactly what has been executed and what has not.

## Private beta acceptance

Organisation profile validation and preview/apply have shared unit/DOM tests,
plus a real-browser import/export scenario. Native Thunderbird checks include
inline image MIME delivery and synthetic OpenPGP keys with cryptographic
verification. Linux CI also starts loopback-only GreenMail 2.1.0 for encrypted
IMAP draft save/reopen and independent remote read-back. Windows CI runs the
native suite without IMAP. Both jobs are required for dependency auto-merging.

Locally, start the synthetic GreenMail fixture on a free loopback port and set
`THUNDERBIRD_IMAP_PORT` to that port to include IMAP coverage. For a manual
production-XPI toolbar check, `THUNDERBIRD_ACCEPTANCE_UI=1` keeps the isolated
app and SMTP fixture alive for up to ten minutes after automated checks. Create
`tests/thunderbird/artifacts/ui-done` to end it early; remove that marker before
a new session. UI sends are saved in `ui-smtp.json`. No personal profile is used.
See [BETA-TESTING.md](BETA-TESTING.md) for the human acceptance checklist.
