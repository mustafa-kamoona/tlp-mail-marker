# Chrome Web Store Materials

Ready-to-use listing text and compliance notes. **Do not publish, create
accounts, or push to a public repository without explicit authorisation.**

## Single purpose

> TLP Mail Marker applies FIRST Traffic Light Protocol (TLP) 2.0 classification
> markings to outgoing email in Roundcube Webmail.

The extension has one narrow purpose: helping a user add and validate a TLP
classification while composing mail. It does not do anything else.

## Short description (≤ 132 characters)

> Apply FIRST TLP 2.0 markings to outgoing email in Roundcube Webmail. No
> tracking, no external servers, no stored messages.

## Detailed description

> TLP Mail Marker helps CSIRTs, CERTs, PSIRTs and other teams apply the FIRST
> Traffic Light Protocol (TLP) 2.0 to email they are about to send.
>
> • Choose TLP:CLEAR, TLP:GREEN, TLP:AMBER, TLP:AMBER+STRICT or TLP:RED from an
> accessible selector in the composer.
> • The correct marking is added to the subject line and the message body.
> • When replying or forwarding, the original classification is detected and
> preselected; lowering it triggers a warning and is never done silently.
> • Optional send-time checks warn or block when a message is unclassified or
> when the subject and body disagree.
> • Works with plain-text and HTML messages, replies, forwards and drafts.
>
> Privacy comes first. There is no telemetry, no analytics, no tracking, no
> external servers and no remote code. Your email content is never stored. Only
> your settings are saved, locally in your browser. Access is requested per
> webmail host, only when you add it.
>
> Note: TLP is an information-sharing protocol, not encryption or access
> control. This extension is an assistive composition tool, not a data-loss
> prevention system or a guarantee of enforcement.

## Category

Productivity → Workflow & Planning (or Communication). Developer account owner
to choose the closest available.

## Permission justifications

| Permission | Justification |
| --- | --- |
| `storage` | Save the user's settings locally (enabled state, authorised hosts, policy, visual preferences). |
| `scripting` | Register the classification content script on the exact hosts the user authorises. |
| `activeTab` | Let the popup read the current tab's address so it can offer to authorise that site. |
| Host permissions (optional, per host) | Inject the composer UI into the user's webmail. No host access is granted at install; each host is requested only when the user adds it. |

## Remote code declaration

> This extension does **not** use remote code. All JavaScript is included in the
> package. There is no `eval`, no `new Function`, and no dynamically loaded
> script. It makes no network requests.

## Data use disclosure

Answer the store's data-use questionnaire as follows:

- Does the extension collect or use personally identifiable information,
  health, financial, authentication, personal communications, location, web
  history, user activity, or website content? → **No.**
- Is data sold to third parties? → **No.**
- Is data used or transferred for purposes unrelated to the single purpose? →
  **No.**
- Is data used to determine creditworthiness or for lending? → **No.**

The extension reads the message being composed **in memory** to display and
validate the marking. Nothing is stored or transmitted. This is a
user-visible, single-purpose function, not data collection.

## Privacy policy

Publish the repository's [`PRIVACY.md`](../PRIVACY.md) at a stable URL and link
it in the listing.

## Graphic assets checklist

- Store icon: 128×128 PNG (use `public/icons/icon-128.png`).
- Screenshots: 1280×800 or 640×400 PNG. Capture the composer with the selector,
  the rich-text composer, a reply with a downgrade warning, and the options
  page. Use synthetic data and neutral hostnames.
- Small promo tile: 440×280 (optional).
- Marquee: 1400×560 (optional).

## Packaging

```sh
npm run release      # clean, build, and zip
```

Output: `release/tlp-mail-marker-<version>.zip` plus a `.sha256` file. Upload
the ZIP in the Chrome Web Store developer dashboard.

Before packaging, confirm:

- [ ] `npm run typecheck && npm test` pass.
- [ ] E2E passes (`npm run e2e`) or the limitation is documented.
- [ ] `manifest.json` version matches `package.json`.
- [ ] No sourcemaps in the production ZIP.
- [ ] No development hosts or credentials in the package.
- [ ] Listing text, permission justifications and privacy disclosures updated.

## Publishing steps (requires authorisation)

1. Create or use a Chrome Web Store developer account (one-time fee).
2. Create a new item and upload the release ZIP.
3. Fill in the listing using the text above.
4. Complete the Privacy practices tab using the data-use disclosure above.
5. Provide the privacy policy URL.
6. Set visibility and distribution; submit for review.
7. Respond to any review feedback; do not change the package after submission
   without re-uploading.

This repository does **not** perform any of these steps automatically.
