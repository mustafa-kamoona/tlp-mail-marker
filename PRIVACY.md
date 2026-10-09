# Privacy Policy

TLP Mail Marker is designed so that it **cannot** collect, transmit or sell your
data. This policy describes exactly what the extension does.

_Last updated: 2026-10-08._

## Summary

- **No telemetry, analytics, tracking or crash reporting.**
- **No external servers and no external APIs.** The extension makes no network
  requests of its own.
- **No email content is stored.** Message bodies, subjects, recipients and
  attachments are processed only on the device, in memory, to show and validate the
  TLP marking. They are never persisted, logged or transmitted.
- The only data persisted is **your settings**, stored locally in your browser.

## What is stored

The extension stores the following in local extension storage (this browser
profile only; it is **not** synced to any account or service):

- Whether the extension is enabled.
- The list of webmail hostnames you authorised, and whether each is enabled.
- Your classification policy (block / warn / off when unclassified).
- Whether downgrade warnings are enabled.
- Visual preferences (mark subject, mark body, colour coding, theme).

No message content, subjects, recipients, attachments, addresses or timestamps
are persisted. The Thunderbird build also keeps each open composer's tab ID
and selected/original TLP levels in `storage.session`, to survive background
suspension. This session data is removed when the composer closes and is not
synced or retained across application restarts.

In a managed (enterprise) deployment, your administrator may also supply
configuration through browser policy (`chrome.storage.managed`). That policy is
read-only, admin-controlled configuration — it contains no email content and is
not transmitted by the extension.

## Permissions and why they are needed

| Permission | Purpose |
| --- | --- |
| `storage` | Save the settings listed above locally. |
| `scripting` | Register the content script for the hosts you authorise. |
| `activeTab` | Let the popup read the current tab's address so it can offer to authorise it. |
| Optional host access (per host you add) | Inject the classification UI into your webmail. Requested individually, at your explicit action. |

The Thunderbird build instead requires `compose` to read and mark the current
composer and validate its send event, plus `storage` for settings. Optional
`messagesRead`, requested only from Settings, allows local inspection of the
source message associated with a reply or forward. Thunderbird grants this
permission broadly; the add-on only uses it for that related source. It can be
revoked in Settings. The production add-on has no permission to send mail on
its own. Its page policy prohibits network connections.

The extension does **not** request access to all websites. It has no host access
until you add a hostname and approve the browser prompt.

## Email content

To mark a message, the extension reads the subject and body of the message you
are currently composing, and, for replies/forwards, the classification already
present in that message. This processing happens entirely on your device,
in memory, inside your browser. It is never stored or sent anywhere.

## Third parties

There are none. The extension bundles all of its code locally, loads no remote
scripts, and performs no dynamic evaluation of untrusted code.

## Changes

Material changes to this policy will be documented in the project changelog and
release notes.

## Contact

Use the security/contact process described in [SECURITY.md](SECURITY.md).
