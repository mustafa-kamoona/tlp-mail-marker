# Architecture & Implementation Plan

## Native Thunderbird build

`src/thunderbird` is a separate MailExtension entry point. It reuses the pure
TLP core and HTML marking routines; Thunderbird's `compose` API replaces the
Roundcube DOM adapter. Its MV3 event page registers the native `onBeforeSend`
listener synchronously, and provides packaged selector, settings and review pages.

Per-composer mutations are serialized. Marking rereads current compose details
after asynchronous original-message detection, so pending reads do not overwrite
the user's edits. HTML is parsed in an inert template, with the original document
shell preserved. Only subject/body changes are sent back to Thunderbird.

Selected and original TLP levels are stored by tab ID in `storage.session`;
settings stay in `storage.local`. Tab closure removes session context. Optional
`messagesRead` allows inspecting only the related original reply/forward message.
The browser build's host and managed-policy settings do not apply to this build.

Native send validation returns a cancellation result for errors or a closed
review. A warning's approval is bound to a SHA-256 digest of compose details,
attachments, context and settings, checked before and after the decision and
consumed once. Popup creation can wait for OS focus, so review decisions do not
await that promise. The review page binds its own window ID; closing an unbound
review cancels conservatively. The production add-on cannot initiate delivery
and prohibits network connections through its page CSP.

## 1. Purpose and scope

TLP Mail Marker is a Manifest V3 browser extension that helps users apply
**FIRST TLP 2.0** markings to outgoing email in **Roundcube Webmail**. It is an
assistive composition tool, not a DLP system, not encryption, and not an access
control mechanism.

Supported classifications (exact TLP 2.0 syntax):

- `TLP:CLEAR`
- `TLP:GREEN`
- `TLP:AMBER`
- `TLP:AMBER+STRICT`
- `TLP:RED`

`TLP:WHITE` is obsolete and is never emitted. It is only recognised for
migration/diagnostics and is reported as non-standard.

## 2. Design principles

1. **Standards first.** Output only canonical TLP 2.0 syntax.
2. **Least privilege.** No broad host permissions; per-domain, user-consented
   access via `optional_host_permissions` + `chrome.permissions.request()`.
3. **No data collection.** No telemetry, analytics, external APIs, or remote
   code. Email content is never stored.
4. **Provider-agnostic core.** All TLP logic is pure and independent of any
   webmail DOM. Providers are isolated behind an adapter interface.
5. **Fail safe.** If the composer cannot be understood, the extension disables
   itself for that page rather than guessing.
6. **Idempotent marking.** Applying a marking repeatedly must not duplicate it.
7. **No send-time races.** Send validation is synchronous in the capture phase.

## 3. Module map

```
src/
  core/            pure, DOM-free where possible
    tlp.ts             canonical levels, definitions, restrictiveness heuristic
    parser.ts          token finding, subject/body analysis
    policy.ts          effective-level detection, reply preselection, change policy
    marking.ts         subject + plain-text body marking transforms
    html-marking.ts    HTML body marking (DOM-aware; jsdom-testable)
    validation.ts      pre-send validation rules
    settings.ts        settings model, defaults, validation, migration
    managed.ts         enterprise managed policy (chrome.storage.managed)
  adapters/
    interface.ts       ProviderAdapter / ComposerHandle / BodyHandle contracts
    registry.ts        adapter lookup
    roundcube/         Roundcube implementation (selectors, body, adapter)
  content/
    index.ts           content-script bootstrap for a document
    scanner.ts         debounced composer scanner (MutationObserver + click)
    composer-controller.ts  orchestration (marking, validation, interception)
    env-probe.ts       MAIN-world probe publishing rcmail.env.compose_mode
    ui/selector.ts     accessible TLP selector (Shadow DOM)
    ui/dialog.ts       blocking / confirmation dialogs and toasts (Shadow DOM)
  background/
    service-worker.ts  install defaults, dynamic script reconciliation, messages
  options/             options page (settings + authorised domains)
  popup/               action popup (authorise current site, status)
  utils/               storage, messaging, logger, dom helpers, i18n
```

Localisation catalogues live in `_locales/<lang>/messages.json` (Chrome i18n),
with a built-in English fallback in `src/utils/i18n.ts`. The canonical TLP
labels are never translated.

## 4. Data flow

```
options page ──request permission──► chrome.permissions
      │                                     │
      └── save domain list (storage.local) ─┘
                       │
        background controller reconciles (Chromium worker / Firefox event page)
        chrome.scripting.registerContentScripts(matches, allFrames)
                       │
                 (page load, user-granted origins)
                       ▼
              content script (isolated world)
                 │
        detect provider via adapters.registry
                 │
        ComposerController:
          read subject/body ─► core.parser ─► core.policy (effective level)
          user selects TLP  ─► core.marking / core.html-marking (idempotent)
          send click (capture) ─► core.validation (sync) ─► allow / block / confirm
```

## 5. Integration strategy (Roundcube)

- **Detection:** presence of `#composebody` (or `[name="_message"]`) inside a
  form, plus a subject field. No dependence on `window.rcmail`.
- **Body modes:** plain = the `#composebody` textarea; HTML = the TinyMCE iframe
  (`.tox-edit-area iframe`, `iframe[id$="_ifr"]`, `.mce-edit-area iframe`),
  accessed via `contentDocument`. Mode is re-detected on every operation and via
  a `MutationObserver`.
- **Send interception:** capture-phase `click` on `document`; a control is a
  send control when its `onclick` calls `rcmail.command('send', …)` or it
  matches `.send`. A capture-phase `submit` listener on the form is a backstop.
  Validation is synchronous; no `await` precedes the allow/deny decision.
- **Confirmation:** for warn-level issues we cancel the original event and, on
  user confirmation, re-trigger the send control once via a short-lived bypass
  token. This keeps the flow synchronous and race-free.
- **Idempotency:** subject uses `[TLP:X]` prefix (existing TLP tokens stripped);
  plain body maintains one leading block; HTML body maintains one marker node.
- **Lifecycle:** a debounced scanner re-evaluates the document on DOM mutations
  and clicks, so composers that appear late or are re-rendered are still picked
  up. An element flag (`data-tlp-attached`) prevents double attachment.
- **Intent:** Roundcube rewrites the compose URL (it drops `_reply_uid`), so
  reply/forward detection uses a minimal MAIN-world probe
  (`src/content/env-probe.ts`) that publishes the public
  `rcmail.env.compose_mode` value as `data-tlp-compose-mode`; URL parsing is a
  fallback.

## 5.1 Design influences

The architecture is original to this project. It deliberately borrows a small
number of well-established *ideas* from other webmail extensions and
reimplements them independently:

- debounced DOM scanning with a per-element attachment flag;
- generic editable/iframe detection and framework-safe value setting;
- provider adapters behind a common interface.

See [`RESEARCH.md`](RESEARCH.md#4-prior-art) for attribution and the license
boundary (no code is copied from AGPL/GPL projects).

## 6. Assumptions

- Users access Roundcube over a single origin that they explicitly authorise.
- TLP labels are emitted in English canonical form regardless of UI language.
- The user is responsible for choosing the correct classification; the extension
  assists but cannot know sensitivity.
- Browser-side checks can be bypassed and are advisory/enforcement aids only.

## 7. Acceptance criteria

Functional:

- [ ] All five levels can be selected and are emitted in canonical form.
- [ ] Subject and body markings are produced for plain and HTML composers.
- [ ] Replies/forwards preselect the detected classification; downgrades warn.
- [ ] Send is blocked or warned per settings when no classification is present.
- [ ] Subject/body disagreement, duplicates and contradictions are detected.
- [ ] Drafts survive save/reopen/reload and repeated edits with no duplicates.
- [ ] Signatures, quotes, links, and attachments are preserved.
- [ ] Multiple composers and RTL/Unicode content behave correctly.
- [ ] Unsupported interfaces are left untouched.

Security:

- [ ] No telemetry, analytics, external APIs, remote code, or `eval`.
- [ ] No email content or recipients are stored.
- [ ] Adversarial HTML cannot inject into the extension UI or execute.
- [ ] Permissions are per-domain and user-consented.
- [ ] Significant findings from the security review are remediated.

Quality:

- [ ] `npm run build` produces a loadable unpacked extension and a store ZIP.
- [ ] Unit + integration tests pass.
- [ ] E2E tests run against a real Roundcube instance (or limitations are
      explicitly documented).
- [ ] Documentation is complete.

## 8. Phases

1. Research & architecture (this document + `RESEARCH.md`).
2. Implementation (core → adapters → content/UI → background/options).
3. Testing (unit, integration, browser E2E).
4. Security hardening review.
5. Release preparation (docs, packaging, store materials).
