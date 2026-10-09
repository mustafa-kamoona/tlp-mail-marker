# Privacy Policy

TLP Mail Marker processes email locally to add and validate TLP markings.
The extension does not transmit your email or settings to the developer or any
third party, and does not sell data. This policy explains that local processing.

_Last updated: 2026-10-09._

## Summary

- **No telemetry, analytics, tracking or crash reporting.**
- **No external servers and no external APIs.** The extension makes no network
  requests of its own.
- **No email content is stored.** The browser extension reads the current
  subject and message body locally to show and validate the TLP marking.
  Thunderbird also reads composer details and checks whether attachments are
  present. The add-on does not read attachment contents. This information is
  never persisted, logged or transmitted by the add-on.
- The browser popup reads the current tab URL when you open it, to offer
  authorisation for that host. It does not record a browsing-history log.
- The only data persisted in the browser build is **your settings**, stored locally.

## What is stored

The extension stores the following in local extension storage (this browser
profile only; it is **not** synced to any account or service):

- Whether the extension is enabled.
- The list of webmail hostnames you authorised, and whether each is enabled.
- Your classification policy (block / warn / off when unclassified), approved
  levels, default level, subject/body marking choices and downgrade warnings.
- Visual preferences (mark subject, mark body, colour coding, theme).

No message content, subjects, recipients, attachment content or message
timestamps are persisted. Authorised website hostnames are retained as settings. The Thunderbird build also keeps each open composer's tab ID
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

## Sharing and third parties

The extension has no developer-operated server, analytics provider or remote
code service. It does not share the locally processed information. Your webmail
provider and browser store operate independently under their own privacy policies.
The extension bundles its code locally and loads no remote scripts.

## Control and retention

Remove an authorised host in Settings to revoke extension access to it. You can
change or remove saved rules through Settings, or uninstall the extension to
remove its local extension storage. Email content is processed in memory for the
current composer and is not retained by the extension. Organisation-profile
import/export is initiated by you and stores a local JSON file containing rules,
not messages.

## Limited use

Locally processed email content and the current website address are used only for
the disclosed marking, validation and site-authorisation features. They are not
used for advertising, profiling, credit decisions or unrelated purposes. The use
of information received from Google APIs adheres to the Chrome Web Store User
Data Policy, including the Limited Use requirements.

## Changes

Material changes to this policy will be documented in the project changelog and
release notes.

## Contact

For ordinary support, use [GitHub Issues](https://github.com/mustafa-kamoona/tlp-mail-marker/issues).
For suspected vulnerabilities, use [private vulnerability reporting](https://github.com/mustafa-kamoona/tlp-mail-marker/security/advisories/new).
Please do not post real email content, credentials or other sensitive information.
