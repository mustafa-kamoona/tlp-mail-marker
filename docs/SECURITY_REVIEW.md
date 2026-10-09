# Security Review

Internal security review of TLP Mail Marker 0.1.0, performed after
implementation (Phase 4). The review covers the extension's own code, its
permissions, its interactions with the webmail page, and its supply chain.

## Method

- Manual source review of every file in `src/`, `scripts/` and `manifest.json`.
- Automated pattern review for dangerous sinks (`innerHTML`, `outerHTML`,
  `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, string-based
  timers, network APIs, dynamic `import()`).
- Review of the built bundles for remote references and third-party runtime
  code.
- Dependency review (`npm audit`, runtime vs development dependencies).
- Adversarial testing in the browser E2E suite (malicious HTML) and unit tests.
- Review against the Chrome Web Store "stay secure" and remote-code policies.

Result of automated pattern review: **no dangerous sinks in `src/`** (matches
were comments only). **No external runtime dependencies.** Built bundles
contain **no** `http(s)://` references.

## Threat model (summary)

See [`RESEARCH.md`](RESEARCH.md#5-threat-model-summary) for the full model.
Assets are the content of outgoing mail and the integrity of the TLP marking.
Adversaries considered: adversarial incoming HTML, a malicious or compromised
webmail page sharing the DOM, silent downgrade, send-time races, label
spoofing, supply-chain compromise and over-broad permissions.

## Findings

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| 1 | Composer intent was inferred from the URL, but Roundcube rewrites the compose URL and drops `_reply_uid`, so replies/forwards were treated as new messages. Downgrade warnings could be skipped (marking integrity). | Medium | **Fixed** |
| 2 | Injected UI uses an *open* shadow root; a page script could read or alter it. | Low | Accepted (documented) |
| 3 | The MAIN-world probe publishes composer intent as a page-writable DOM attribute; a malicious page could spoof it. | Low | Accepted (documented) |
| 4 | Browser-side send validation is bypassable (disable the extension, devtools, another client). | Informational | Accepted (inherent, documented) |
| 5 | Development dependencies have published advisories (esbuild dev server, tinypool, vitest mocker). | Low (dev only) | Accepted (documented) |
| 6 | `optional_host_permissions` declares broad patterns (`https://*/*`, `http://*/*`). | Low | Accepted (per-host grant, documented) |

No High or Critical findings were identified in the shipped code.

### Finding 1 — unreliable intent detection (Fixed)

**Issue.** Detection of reply/forward relied on `location.search`. Empirically,
Roundcube 1.6.19 redirects a reply/forward compose to
`?_task=mail&_action=compose&_id=…`, removing `_reply_uid`. As a result the
extension could not tell a reply from a new message, so the "never silently
downgrade" safeguard could be skipped.

**Impact.** An operator lowering the classification on a reply/forward might not
be warned.

**Remediation.** Added a minimal MAIN-world probe
(`src/content/env-probe.ts`) that reads the public `rcmail.env.compose_mode`
value and publishes it as `data-tlp-compose-mode` on `<html>`, dispatching a
`tlp-compose-env` event. The controller recomputes intent on demand and adopts
the original level when the probe arrives late. URL parsing and (where
applicable) the composer's own DOM remain fallbacks. Regression tests:
`tests/integration/composer-controller.test.ts` ("uses the MAIN-world compose
mode…", "adopts the original level when the environment probe arrives late")
and E2E `reply-downgrade-warning`.

### Finding 2 — open shadow root (Accepted)

The selector/dialog UI is rendered in an open shadow root. A script running on
the webmail page shares the DOM and can therefore read or mutate the injected
UI. There is no secret in the UI, no credential, and no network channel; the
page already fully controls the composer DOM it shares. The worst case is that a
malicious page changes which classification is selected or removes the UI —
equivalent to the page simply not using the extension. Rendering all values
with `textContent` means the page cannot use the UI to inject markup into the
extension's context. Kept open to preserve accessibility tooling and testability.

### Finding 3 — page-writable intent attribute (Accepted)

A malicious page could set `data-tlp-compose-mode="new"` to suppress downgrade
warnings, or `"reply"` to add a spurious warning. This affects an advisory
warning only. It cannot leak data, cannot cause a message to be sent, and cannot
change the marking itself (the marking follows the user's explicit selection and
the message content). The attribute is treated as a hint, never as a
trust boundary; the user remains the decision-maker.

### Finding 4 — bypassable validation (Accepted, inherent)

Any browser-side check can be bypassed. This is documented in the README,
PRIVACY and CHROME_WEB_STORE material. The extension makes no claim to be DLP or
enforcement. Server-side policy remains necessary for guarantees.

### Finding 5 — development dependency advisories (Accepted)

`npm audit --omit=dev` reports **0 vulnerabilities**: the shipped extension has
no runtime dependencies. The full audit reports advisories in development-only
packages (`esbuild`'s optional dev server, `tinypool`, and a `vitest` mock
helper). These are build/test tools, are not bundled, and are not executed by
users. A clean upgrade is blocked by a peer-dependency conflict; the risk is
tracked for a follow-up dependency refresh.

### Finding 6 — optional host permission breadth (Accepted)

The manifest declares `https://*/*` and `http://*/*` as **optional** host
permissions so that any self-hosted Roundcube can be authorised, including
internal deployments over plain HTTP. No host permission is granted at install;
each host is requested individually when the user adds it, and can be revoked.
Using a narrower static set is not possible for a tool whose target host is
chosen by the user.

## Positive controls verified

- **No remote code, no dynamic evaluation.** All JavaScript is bundled in the
  package. The content-script CSP forbids `eval` and remote scripts; the code
  complies.
- **No data collection.** No `fetch`/`XMLHttpRequest`/`WebSocket`; no analytics;
  no external hosts. Settings only, in `chrome.storage.local`.
- **No email content stored.** The settings model explicitly drops unknown keys
  (`tests/unit/settings.test.ts`).
- **Untrusted input handling.** TLP tokens are parsed with a strict allow-list;
  no page/message content is ever rendered as HTML. Adversarial HTML E2E and
  unit tests confirm no execution and safe marking.
- **Message integrity.** Marking transforms are idempotent and preserve
  signatures, quotes, links and attachments (unit + integration + E2E).
- **Race-free validation.** Send validation is synchronous in the capture
  phase; a short-lived, single-use re-entry token is used for the "send anyway"
  confirmation; a re-entrancy guard prevents loops.
- **Least privilege at install.** `storage`, `scripting` and `activeTab` only;
  host access is optional and per-domain.
- **Enterprise policy is safe by construction.** Managed settings are read from
  the browser's read-only `chrome.storage.managed` area; the extension never
  writes to it, and policy carries configuration only (no email content).
- **No remote resources.** UI strings and translation catalogues are bundled in
  the package (`_locales`, `src/utils/i18n.ts`); no fonts, scripts or styles are
  fetched from the network. TLP labels are never translated.
- **Defence in depth.** Content-script isolation, per-domain registration,
  fail-safe no-op on unrecognised interfaces, and idempotent operations.

## Residual risk and limitations

- Browser-side validation is bypassable; see Finding 4.
- Intent and classification detection in free text is heuristic; conflicts and
  legacy `TLP:WHITE` are surfaced rather than auto-resolved.
- Only Roundcube has been validated. Other providers fall back to a no-op.
- Larry/Classic skins and non-Chromium browsers are untested (see
  [`COMPATIBILITY.md`](COMPATIBILITY.md)).

## Statement

TLP Mail Marker is an information-sharing composition aid. It is **not**
encryption, not access control, and **not** a DLP or guaranteed enforcement
mechanism. This review did not identify any High or Critical defect in the
shipped code; the Medium integrity finding was remediated and is covered by
regression tests.
