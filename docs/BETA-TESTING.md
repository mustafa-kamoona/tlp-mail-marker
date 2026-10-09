# Private v0.3.1 beta — tester pack

This is a private prerelease for 2–3 trusted testers. Download its assets while
signed in to a GitHub account that can access mustafa-kamoona/tlp-mail-marker. Repository
access is managed by the owner. Do not upload these packages to an add-on store
or distribute them publicly yet.

The v0.3.1 Firefox signing submission is complete. Distribute its XPI only after
the maintainer downloads and verifies Mozilla’s signed file.

## Install

Verify `SHA256SUMS` or the archive's separate `.sha256` file. macOS/Linux:
`shasum -a 256 <filename>`; Windows: `Get-FileHash <filename> -Algorithm SHA256`.

- **Chromium:** unzip `tlp-mail-marker-0.3.1.zip` into a folder. In Chrome's
  Extensions page, enable Developer mode, choose **Load unpacked**, then select
  that folder. In the extension's Settings, add your exact Roundcube hostname
  and approve access. Validated Roundcube version: 1.6.19, Elastic skin.
- **Firefox desktop 140+:** open Add-ons and themes → gear menu →
  **Install Add-on From File**, choose the Mozilla-signed
  `tlp-mail-marker-firefox-0.3.1.xpi`, and approve installation. Add your
  Roundcube host in Settings, approve access, and reload webmail tabs.
  Local unsigned builds still need temporary installation; see
  [FIREFOX.md](FIREFOX.md).
- **Thunderbird:** open Add-ons and Themes → Extensions → gear menu →
  **Install Add-on From File**. Choose `tlp-mail-marker-thunderbird-0.3.1.xpi`
  and approve compose/storage access. Thunderbird 140+ is required. Test first
  with a disposable profile or a test mail account.

Keep `RELEASE-NOTES.md` and `COMPATIBILITY.md` with the packages. Before using
real information, send only synthetic messages to an account you control.

## Acceptance checklist (about 15–20 minutes per client)

1. Open a new plain-text message. Select every level. Confirm exactly one
   subject label and one leading body label. Repeat a selection twice.
2. Repeat with HTML, a signature, a quoted reply, an attachment and an inline
   image. Confirm they survive both classification changes and received mail.
3. Save/reopen a draft. For Thunderbird, try your IMAP Drafts folder too.
4. Open two composers and choose different levels. Confirm they stay separate.
5. Set missing classification to **Require/Block**. Try Send from the toolbar
   and the client's keyboard shortcut. Both must stop unclassified mail.
6. Set it to **Warn**. Cancel/close the review and confirm nothing arrives.
   Explicitly approve one unchanged test message and confirm it arrives once.
7. Reply/forward a RED test message and select GREEN. Confirm a downgrade
   warning. Confirm only if you have permission for this synthetic message.
8. Export an organisation profile, import it on the other client, inspect the
   preview and apply. Confirm matching levels/default/missing rule. Import a
   malformed JSON file: it must not change settings.
9. Keep a classified draft open, then remove its level from the approved list.
   Sending must stop until an approved classification is selected.
10. Thunderbird: try Send Later, then native OpenPGP signed/encrypted test mail
    if already configured. Confirm both TLP markings and cryptographic state.

Check keyboard navigation of the picker, warnings, settings and profile import.
Try every settings control, then restore your preferred configuration.
Colour must never be the only way to identify the classification.

## Report feedback

Send feedback to the repository owner or open an issue in the private repo.
Include OS, client version, Roundcube version/skin if applicable, plain/HTML,
step number, expected vs actual behaviour, and whether mail actually arrived.
Use synthetic text and cropped screenshots. Do not include private email,
recipients, attachments, passwords, keys or an entire mailbox/profile.

Record each checklist item as pass/fail/not tried. Current unexecuted coverage
is listed in `COMPATIBILITY.md`; a beta package is not a claim that those checks
have passed. Tester selection and distribution remain with the owner.
