# Contributing to TLP Mail Marker

Thanks for helping improve a tool used by CSIRTs and other security teams.

## Code of conduct

Be respectful and constructive. Assume good faith. This project follows the
spirit of the [Contributor Covenant](https://www.contributor-covenant.org/).

## Before you start

- Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
  [`docs/RESEARCH.md`](docs/RESEARCH.md) so your change fits the design.
- Keep the security and privacy invariants intact:
  - no telemetry, analytics, external APIs or remote code;
  - no storage of email content;
  - no broad host permissions;
  - no `innerHTML`/`outerHTML` with dynamic data, no `eval`, no `new Function`.
- **License hygiene:** this project is MIT. Do **not** copy code from
  AGPL/GPL projects (for example Mailvelope or Roundcube) into this repository.
  You may borrow *ideas* and reimplement them independently; cite the
  inspiration in a comment where relevant.

## Development setup

Requirements: Node.js 24.15+ (or Node.js 26+) and npm. See `.node-version`.

```sh
npm install
npm run typecheck
npm test
npm run build
```

Load `dist/` as an unpacked extension (see [`docs/INSTALL.md`](docs/INSTALL.md)).

## Making changes

1. Fork and branch from the default branch.
2. Keep changes focused; one concern per pull request.
3. Add or update tests:
   - pure logic changes → `tests/unit`;
   - DOM/adapter/controller changes → `tests/integration`;
   - user-visible composer behaviour → `tests/e2e`.
4. Run the full gate before opening a PR:

   ```sh
   npm run typecheck && npm test && npm run build
   ```

5. For behaviour that touches the composer, also run the browser suite
   (`npm run e2e`, requires Docker). If you cannot run it, say so in the PR and
   explain what you verified instead — do not claim unverified behaviour.

## Coding style

- TypeScript, strict mode. Prefer small, pure functions in `src/core`.
- No runtime dependencies. If you think one is needed, explain why in the PR;
  it will be scrutinised.
- Use `textContent` to render any value derived from a page or message.
- Keep the TLP engine free of DOM and browser APIs.

## Adding a language

UI strings live in `_locales/<lang>/messages.json` (Chrome's i18n format). The
built-in English fallback in `src/utils/i18n.ts` is the source of truth for the
key set.

1. Copy `_locales/en/messages.json` to `_locales/<lang>/messages.json`.
2. Translate the `message` values. **Do not translate the TLP labels**
   (`TLP:CLEAR`, `TLP:GREEN`, `TLP:AMBER`, `TLP:AMBER+STRICT`, `TLP:RED`) — the
   standard requires them to remain in their original form.
3. Keep `{token}` placeholders intact (for example `{level}`, `{host}`).
4. Run `npm test` — `tests/unit/i18n.test.ts` fails if a locale is missing keys,
   has empty strings, or drops a TLP label from a description.

No code changes are needed; Chrome selects the catalogue from the browsing UI.

## Adding a webmail provider
1. Implement the `ProviderAdapter` / `ComposerHandle` / `BodyHandle` contracts
   in `src/adapters/<provider>/`.
2. Reuse `src/core` unchanged for all TLP logic.
3. Register it in `src/adapters/registry.ts`.
4. Add integration tests with a fixtures file that mirrors the provider's
   composer markup, plus real-browser E2E coverage.
5. Document the validated provider version in
   [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md).

## Reporting issues

- Security issues: use the private process in [`SECURITY.md`](SECURITY.md).
- Everything else: open an issue with steps to reproduce using **synthetic**
  messages only.

## Licensing of contributions

By contributing you agree that your contributions are licensed under the MIT
License (see [`LICENSE`](LICENSE)).
