# Screenshots

These images are captured by the browser E2E suite from a real Roundcube 1.6
(Elastic skin) with the extension loaded. They use synthetic data only:
`test@example.com`, "Synthetic Sender" and the neutral host `mail.example.gov`.

| File | Shows | Size |
| --- | --- | --- |
| `composer-selector.png` | New composer with the TLP selector under the subject | 1280×800 |
| `rich-text-marking.png` | HTML editor with `TLP:RED` applied to subject and body | 1280×800 |
| `downgrade-warning.png` | Reply to a `TLP:RED` message after choosing `TLP:GREEN` | 1280×800 |
| `quoted-text-warning.png` | Quoted text is more restrictive than the selected level | 1280×800 |
| `options.png` | Settings page with an authorised host | 1280×800 |
| `popup.png` | Toolbar popup with the TLP legend (not a Store screenshot size) | 400×560 |

## Regenerating

```sh
npm run build:e2e
npm run e2e
```

Raw output goes to `tests/e2e/artifacts/` (git-ignored). Copy the files you
want here. The Chrome Web Store requires 1280×800 or 640×400, so use the five
1280×800 images for the listing.

Never commit screenshots containing real addresses, hostnames or message
content.
