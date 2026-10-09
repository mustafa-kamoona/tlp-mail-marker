# Firefox desktop private beta

Firefox 140+ shares the existing Roundcube marking engine, settings,
localisation and organisation-profile controls. Its separate package uses a
Manifest V3 event background and add-on ID `tlp-mail-marker@mustafa-kamoona`.
No broad site access is granted at installation and no data collection is
declared. Authorise each Roundcube host in Settings.

## Install the signed private build

Mozilla approved and signed v0.3.0 for **unlisted self-distribution** on
2026-10-09. The v0.3.1 icon update and matching build source were approved on the same
date, and its signed package was downloaded and verified. There is no
public add-on store listing; the repository remains private.

1. Obtain `tlp-mail-marker-firefox-0.3.1.xpi` and its `.sha256` file from the
   maintainer's private tester pack and verify the checksum.
2. In Firefox, open **Add-ons and themes** (`about:addons`).
3. Open the gear menu, choose **Install Add-on From File**, and select the XPI.
4. Approve installation. Add your Roundcube host in Settings, approve site
   access, and reload existing webmail tabs.

For v0.3.0 and v0.3.1, permanent installation and persistence after restart were verified in Firefox
157.0.1 on macOS using a disposable profile with signature enforcement enabled.
The signed payload matches the submitted build, apart from Mozilla removing the
manifest's trailing newline and adding signature metadata. Android is untested.

## Install a locally built unsigned package

1. Verify the ZIP against its `.sha256` file, then extract it into a folder.
2. Open `about:debugging#/runtime/this-firefox` in Firefox desktop.
3. Choose **Load Temporary Add-on** and select the extracted `manifest.json`.
4. Add your Roundcube hostname in Settings and approve the permission prompt.
   Reload existing webmail tabs.
5. Try the [beta checklist](BETA-TESTING.md) with synthetic mail.

The installation ends when Firefox closes. Keep the extracted folder to load
it again. The unsigned ZIP cannot be installed permanently through the ordinary
Add-ons manager in standard Firefox.

## Permanent installation

Mozilla signing is required for permanent installation in standard Firefox.
An **unlisted** AMO signing submission provides a signed package without a public
store listing, but submits the package, and potentially build source, to Mozilla
for review. Local builds remain unsigned; rebuilding does not reproduce Mozilla's
signature. New versions must be submitted through the existing add-on's Developer
Hub entry. Keep the add-on ID unchanged. This beta has no automatic update URL;
install later signed packages manually.

Official instructions:
[signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/),
[submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/).

## Build and test

```sh
npm run build:firefox
npm run package:firefox
FIREFOX_BINARY=/path/to/firefox npm run e2e:firefox
```

The native runner requires the synthetic fixture from
`tests/e2e/docker-compose.yml` at `http://127.0.0.1:8081` and IMAP port 3143.
It loads the unmodified production ZIP into a disposable profile, approves the
real optional-host permission prompt, and exercises Roundcube composition and
delivery. Reports/logs go to `tests/firefox/artifacts/`. CI runs pinned stable
and ESR versions; both checks gate dependency auto-merging.

Use `npm run build:firefox:dev` for readable output. Reload the temporary add-on
from `about:debugging` after rebuilding. Package only production builds.

Manifest validation:

```sh
npm exec --yes --package=web-ext@10.7.0 -- web-ext lint --source-dir dist-firefox --warnings-as-errors
```

## Scope and differences

- Desktop is tested. Android is untested; its manifest minimum is 142 because
  the no-data-collection declaration requires that version there.
- Firefox managed settings use a native storage manifest or `3rdparty` policy,
  rather than Chromium's `storage.managed_schema`. See
  [managed storage](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/managed).
  Shared code reads that API, but administrator provisioning is untested.
  Firefox policy changes require a restart.
- Browser checks remain bypassable. Mailvelope integration, other skins and
  other browser/OS combinations retain the limits in
  [COMPATIBILITY.md](COMPATIBILITY.md). This is a composition aid, not DLP.
