# Organisation profiles

The browser extension and Thunderbird add-on use the same portable JSON format.
In Settings, choose approved classifications, a default for new messages and
the rule for sending without a classification. Thunderbird requires **Save
settings**; the browser saves changes immediately. Name the preset and choose
**Export current rules**. Share the file through your organisation's usual channel.

On the other client, choose the JSON file under **Organisation profiles**. Read
the preview, then choose **Apply previewed profile**. Importing a file alone
does not change settings. Bad values, unknown fields and files over 16 KB are
rejected. You can edit the rules later and export a replacement.

Example: [organisation-profile.example.json](organisation-profile.example.json).
Use your own approved levels and default; this example is not a recommended
classification policy.

```json
{
  "format": "tlp-mail-marker-profile",
  "version": 1,
  "name": "Example organisation",
  "settings": {
    "allowedLevels": ["TLP:CLEAR", "TLP:GREEN", "TLP:AMBER", "TLP:AMBER+STRICT", "TLP:RED"],
    "defaultLevel": null,
    "missingClassification": "warn"
  }
}
```

`allowedLevels` must contain 1–5 unique canonical TLP 2.0 values. `defaultLevel`
must be one of those values or `null` (ask the sender). `missingClassification`
is `off`, `warn` or `block`. The name has 1–100 characters. All fields are
required; extensions to this schema need a new supported version.

Only these three rules are exported. Domains, host permissions, message access,
email content, enabled/disabled switches and appearance stay local. Import
does not grant permissions or turn a disabled extension on. A classification
removed from the approved list is rejected at send time in an already-open
composer; select an approved level to continue.

Profiles are user-editable presets. Browser administrator policy always takes
priority and locked keys cannot be replaced by an import. Thunderbird does not
yet support administrator-enforced policy. These client checks can be disabled
and do not replace mail-server policy, DLP or encryption.
