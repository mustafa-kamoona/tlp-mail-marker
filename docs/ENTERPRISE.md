# Enterprise Deployment

TLP Mail Marker supports **managed policy** so administrators can preconfigure
and lock down the extension fleet-wide, and **force-install** it with host
access. Managed configuration is read from the read-only `chrome.storage.managed`
area; it never touches email content and requires no network access.

## How managed policy works

The schema and installation examples below apply to Chromium. Firefox uses a
native storage manifest or `3rdparty` policy for the same managed values and
requires a browser restart after policy changes. Its manifest omits Chromium's
`storage.managed_schema` key. See [the Firefox guide](FIREFOX.md); administrator
provisioning on Firefox remains untested.

The extension declares a policy schema (`public/managed_schema.json`) in the
manifest:

```json
"storage": { "managed_schema": "managed_schema.json" }
```

Chrome validates the values you set against this schema and exposes them to the
extension. Policy values **override** the user's settings for the keys they
define, and the affected controls appear **locked** ("managed") in the options
page.

## Policy keys

| Key | Type | Effect |
| --- | --- | --- |
| `enabled` | boolean | Master switch. `false` disables the extension for everyone. |
| `domains` | string[] | Webmail hostnames the extension may run on. Users cannot remove them. |
| `allowUserDomains` | boolean | When `false`, users cannot add their own hosts. |
| `missingClassification` | `"off" \| "warn" \| "block"` | What happens when sending unclassified. |
| `warnOnDowngrade` | boolean | Warn when a reply/forward lowers the classification. |
| `markSubject` | boolean | Include the `[TLP:…]` subject prefix. |
| `markBody` | boolean | Include the body marking. |
| `colorCoding` | boolean | Use official TLP colours (the text label is always shown). |
| `allowedLevels` | string[] | Restrict the selector to a subset of TLP 2.0 labels. |
| `defaultLevel` | string | Preselect a level for **brand-new** messages (must be within `allowedLevels`). |

`allowedLevels` and `defaultLevel` use the exact canonical tokens:
`TLP:CLEAR`, `TLP:GREEN`, `TLP:AMBER`, `TLP:AMBER+STRICT`, `TLP:RED`.

## Example: managed configuration

Set values under the extension's ID using the platform policy mechanism
(`3rdparty.extensions.<EXTENSION_ID>`) — registry on Windows, a configuration
profile on macOS, and a JSON policy file on Linux. A Linux JSON example:

```json
{
  "3rdparty": {
    "extensions": {
      "abcdefghijklmnopabcdefghijklmnop": {
        "enabled": true,
        "domains": ["mail.example.gov", "webmail.agency.gov"],
        "allowUserDomains": false,
        "missingClassification": "block",
        "warnOnDowngrade": true,
        "allowedLevels": [
          "TLP:CLEAR",
          "TLP:GREEN",
          "TLP:AMBER",
          "TLP:AMBER+STRICT"
        ],
        "defaultLevel": "TLP:AMBER"
      }
    }
  }
}
```

The example above would, for instance, forbid `TLP:RED` over email, require a
classification before sending, restrict the extension to two hosts, and start
new messages at `TLP:AMBER`.

## Example: force-install and grant host access

Use the `ExtensionSettings` policy to install the extension and grant runtime
host access for your webmail hosts (so users do not have to approve each one):

```json
{
  "ExtensionSettings": {
    "abcdefghijklmnopabcdefghijklmnop": {
      "installation_mode": "force_installed",
      "update_url": "https://your-intranet.example/chrome/updates.xml",
      "runtime_allowed_hosts": [
        "https://mail.example.gov",
        "https://webmail.agency.gov"
      ]
    }
  }
}
```

`runtime_allowed_hosts` grants the host permissions the extension needs for its
content scripts. The background service worker registers content scripts only
for hosts that are both **in the `domains` policy** and **actually granted**, so
the two policies work together.

See the Chrome Enterprise policy documentation for `ExtensionSettings` and the
per-platform policy formats.

## Behaviour notes

- **Precedence:** managed > user. A user cannot change a locked value, and
  clearing user storage does not remove policy.
- **`defaultLevel`** preselects a classification only for genuinely new
  messages; replies/forwards keep the detected original classification.
- **Forbidden original level:** if a message being replied to carries a level
  that `allowedLevels` forbids, the extension does not preselect it and warns;
  any permitted selection that widens sharing is still flagged as a downgrade.
- **Live updates:** policy changes are picked up at runtime
  (`storage.onChanged`, area `managed`) and the content scripts are reconciled
  automatically.
- **Privacy:** policy configures behaviour only. No email content, recipients,
  or attachments are read for policy, stored, or transmitted.

## Local testing

You can test the managed path without a managed device by writing policy values
with the `chrome.storage.managed` schema in a test profile, or by unit-testing
the policy layer (`tests/unit/managed.test.ts`). The options page will show the
"Managed by your administrator" banner whenever a policy is present.
