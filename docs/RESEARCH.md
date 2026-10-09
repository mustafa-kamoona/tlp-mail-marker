# Research Notes

This document records the standards research, integration findings, assumptions,
and unresolved uncertainties that shape TLP Mail Marker. It is a living document.

## 1. FIRST TLP 2.0 (authoritative)

Source: <https://www.first.org/tlp/> (FIRST Traffic Light Protocol 2.0, authoritative from August 2022).

Key normative facts used by this extension:

- There are exactly **four** TLP labels: `TLP:RED`, `TLP:AMBER`, `TLP:GREEN`, `TLP:CLEAR`.
  In written form they **MUST not contain spaces** and **SHOULD be in capitals**.
  TLP labels **MUST remain in their original form**, even in other languages
  (content may be translated; the labels may not).
- `TLP:AMBER+STRICT` is an explicit **restriction modifier** on `TLP:AMBER`:
  it limits sharing to the recipient's own **organization only** (clients are
  *not* included). It is not a separate colour and not a separate label in the
  four-label list; it is written as `TLP:AMBER+STRICT`.
- For **messaging** (the case here): the TLP label **MUST** be indicated
  directly prior to the information itself, and **SHOULD** be in the email
  subject line. Where needed, the end of the labelled text should be marked.
- The `TLP:WHITE` designation is **obsolete** (TLP 1.0). It must not be emitted.
  TLP 1.0 also used `TLP:AMBER+STRICT` differently; the 2.0 semantics above are
  authoritative.
- Colour coding (for accessibility, text label always remains):
  - `TLP:RED`   font `#FF2B2B`, background `#000000`
  - `TLP:AMBER` font `#FFC000`, background `#000000`
  - `TLP:GREEN` font `#33FF00`, background `#000000`
  - `TLP:CLEAR` font `#FFFFFF`, background `#000000`
- TLP is **not** a formal classification scheme, **not** a licence, **not**
  encryption or access control. It does not define a universal numeric
  hierarchy. The source may add restrictions; recipients must obtain explicit
  permission from the source to share more widely.

### Design consequence

TLP levels cannot be mechanically ordered for *sharing semantics*. However,
users need a "you appear to be reducing the audience" warning. We therefore
implement a **documented restrictiveness heuristic** used only for advisory
warnings and never for enforcement:

```
CLEAR (0) < GREEN (1) < AMBER (2) < AMBER+STRICT (3) < RED (4)
```

The heuristic is a user-assistance affordance, not a claim about TLP semantics.
Downgrades are warned about, never silently performed, and never blocked unless
the user has configured blocking.

## 2. Chrome Manifest V3

Sources: Chrome Extensions "Content scripts", "Message passing", "Security and
privacy" documentation.

- MV3 forbids remotely hosted executable code and `eval` of untrusted data.
  All JS is bundled locally; no external scripts, no dynamic evaluation.
- Content scripts run in an **isolated world** by default: they share the DOM
  with the page but not the page's JS variables. They may use `chrome.runtime`
  messaging, `chrome.storage`, and limited APIs; everything else is via the
  service worker.
- Content scripts can be declared statically, registered dynamically via
  `chrome.scripting.registerContentScripts`, or injected programmatically.
- Dynamic registration supports `allFrames: true`, which we need because
  Roundcube renders the composer inside a same-origin content iframe.
- Messaging uses JSON serialization (not structured clone). Messages must be
  JSON-safe. The service worker is event-driven and may be terminated; state
  must live in `chrome.storage`.
- Optional host permissions (`optional_host_permissions`) plus
  `chrome.permissions.request()` allow per-domain, user-consented access. This
  is preferred over `<all_urls>` for least privilege.
- `runtime.onMessage` listeners should validate all input; messages originating
  from a content script are considered less trustworthy.

### Design consequence

- **No** static broad `content_scripts`. We register content scripts dynamically
  only for user-authorised origins.
- **No** telemetry, analytics, external APIs, or remote code.
- The service worker only uses `storage`, `scripting`, `permissions`, and
  `runtime`/`action` events.

## 3. Roundcube Webmail composer

Sources: Roundcube 1.6.x source (`skins/elastic/templates/compose.html`,
`program/js/app.js`, `program/js/editor.js`). Current stable line at time of
writing: **1.6.x** (1.6.19).

### DOM (Elastic skin, also used by other modern skins)

- Composer form fields: `_from`, `_to`, `_cc`, `_bcc`, `_subject`, `_message`,
  `_is_html`, `_draft`, `_attachments`.
- Subject input: `#compose-subject` / `[name="_subject"]`.
- Body: `<textarea id="composebody" name="_message">` in **plain text** mode.
- HTML mode: Roundcube initialises **TinyMCE** over `#composebody`; the visible
  editable document lives in an iframe inside `.tox-edit-area`. The hidden
  `#composebody` textarea remains in the DOM and is the real form field.
- "Send" and "Save draft" controls are links rendered with
  `onclick="return rcmail.command('send', this, event)"` (command name
  `send` / `savedraft`). Class hints: `.send`, `.save.draft`.
- The composer may be loaded inside the content iframe (`_framed=1`) or in a
  separate window (`_extwin=1`). URL parameters reveal intent:
  `_reply_uid`, `_all` (reply-all/list), `_forward_uid`,
  `_forward_inline`, `_draft_uid`, `_id`.

### Behaviour (`app.js`)

- `init_messageform()` initialises the form and starts autosave.
- `command('send')` → `check_compose_input()` → `submit_messageform()`.
- `check_compose_input()` calls `this.editor.save()` (TinyMCE writes the live
  iframe DOM back into `#composebody`) **before** submitting. It also owns the
  empty-subject / empty-body / recipient checks.
- `submit_messageform()` calls `form.requestSubmit()` after setting the target
  iframe and busy state.
- `command('savedraft')` → `submit_messageform(true)` (does **not** run
  `check_compose_input()`).
- Autosave (`auto_save_start`) calls `command('savedraft')` on a timer; it is
  not user clickable, so it cannot be intercepted through DOM events. It relies
  on whatever is currently in the editor DOM.
- `editor.save()` (`editor.js`) delegates to TinyMCE's `editor.save()`, which
  serialises the current iframe body into the textarea. TinyMCE serialises the
  **live DOM**, so inserting nodes directly into the editor body is preserved.
- `editor.get_content()` also reads the live TinyMCE DOM.
- Plain↔HTML conversion is performed **server-side** via
  `_task=utils&_action=html2text|text2html`, so a marking can change shape
  across mode switches (e.g. `<div>TLP:AMBER</div>` ⇄ `TLP:AMBER`).

### Design consequence

- Use **DOM-only** integration in the isolated world. We do not read or call
  `window.rcmail` (undocumented, unstable across versions, and not available in
  the isolated world without main-world injection which is subject to page CSP).
- Detect the composer by its DOM (`#composebody` + a surrounding form), not by
  Roundcube version or skin.
- Read composer intent from `location.search`, which is stable and public.
- Intercept **user-initiated** send in the capture phase on `document` for
  clicks whose `onclick` invokes `rcmail.command('send', …)`, and use a form
  `submit` capture listener as a backstop. Autosave drafts cannot be
  intercepted; we guarantee idempotent marking so autosave never duplicates.
- HTML marking inserts a single top-level node; plain marking maintains a single
  leading block. Both are idempotent and survive TinyMCE serialisation.

## 4. Prior art

- **[TLP 2.0 - Classification](https://addons.thunderbird.net/en-US/thunderbird/addon/tlp-2-0-classification/)**
  by Michael Stern (Neeteran), MIT, is independently authored prior art.
  Its packaged source was inspected after this project's Thunderbird support
  was implemented. No code or assets from that add-on were imported.

- **[Mailvelope](https://github.com/mailvelope/mailvelope)** is an established
  (AGPL-3.0) webmail extension for OpenPGP. Several of its *architectural ideas*
  are directly relevant and were reimplemented independently here, without
  copying code:
  - **Debounced DOM scanning** — observe the document (plus clicks), debounce,
    then re-scan for editable regions, so dynamically created composers are
    found. Adopted in `src/content/scanner.ts`.
  - **Per-element attachment flags** (`dataset`) to avoid attaching UI twice.
  - **Generic editable detection** — `[contenteditable]`, `textarea`, and
    dynamic iframes whose body is editable. Informed the tolerant editor
    detection in the Roundcube adapter.
  - **Framework-safe value setting** — reset React-style value trackers before
    assigning `value` so host apps observe programmatic edits. Adopted in
    `src/utils/dom.ts` for future providers.
  - **Provider modules behind a common interface**, looked up per host, with a
    default fallback. This project instead dispatches on the composer DOM
    contract (so arbitrary self-hosted Roundcube works), but the adapter
    interface plays the same role.

### License boundary

Mailvelope and Roundcube are licensed under the **AGPL-3.0** and **GPL-3.0**
respectively. This project is **MIT**. No source code from those projects is
copied into this repository; only general, non-copyrightable techniques are
borrowed, as described above. Contributors must follow the same rule (see
`CONTRIBUTING.md`).


## 5. Threat model (summary)

Assets: the content of the user's outgoing email; the TLP marking's integrity.

Adversaries / hazards:

1. **Adversarial incoming HTML** in a message being replied to or forwarded,
   attempting to inject content into the composer or into our UI.
2. **A malicious or compromised webmail page** attempting to influence the
   extension (it cannot read the isolated world, but shares the DOM).
3. **Silent downgrade** of a classification when replying/forwarding.
4. **Race conditions** at send time allowing an unmarked message to leave.
5. **Label spoofing** — crafted TLP-looking strings in quoted content.
6. **Supply-chain** and dependency risk.
7. **Over-broad permissions / data leakage** by the extension itself.

Mitigations are described in `docs/SECURITY.md` and enforced by tests.

## 6. Unresolved uncertainties / limitations

- **Browser-side validation is bypassable.** A user can disable the extension,
  use another client, or use developer tools. TLP Mail Marker is an aid, not a
  DLP or enforcement system.
- Roundcube **skins** other than Elastic/Larry may use different markup; the
  adapter targets the documented `#composebody` / `_subject` contract and is
  covered by an explicit "unsupported interface" fallback (no-op, no breakage).
- **Autosave** cannot be intercepted from the isolated world; correctness relies
  on idempotent marking rather than on hooking the save.
- **TinyMCE internals** could change serialisation in future versions. We test
  against a pinned Roundcube image and document the validated version.
- Server-side normalisation (HTML→plain) changes the marking shape; we adopt
  and normalise rather than duplicate.
- No claim is made that the marking survives every downstream mail system; the
  text label is the durable part, colour is an enhancement.

## 7. Validated environments

See `docs/COMPATIBILITY.md` for the exact Roundcube versions, browsers, and
test outcomes. This section is updated when E2E runs are executed.
