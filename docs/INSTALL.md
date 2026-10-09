# Installation

## Thunderbird

Build the separate XPI with `npm run build:thunderbird` and
`npm run package:thunderbird`, then use Thunderbird's **Add-ons and Themes →
Extensions → gear menu → Install Add-on From File**. Thunderbird 140+ is required.
See [the Thunderbird guide](THUNDERBIRD.md) for permissions, usage and testing.

## For users (from the Chrome Web Store)

The repository and releases remain private; no public listing is available.
Use the private beta/developer instructions until publication.

1. Install **TLP Mail Marker** from the Chrome Web Store.
2. Open the extension's **Settings** (or click the toolbar icon → *Settings*).
3. Under **Authorised webmail domains**, enter your Roundcube hostname (for
   example `mail.example.gov`) and choose **Add domain**.
4. Approve the browser prompt to allow access to that host.
5. Open Roundcube and start composing — the TLP selector appears beneath the
   subject field.

Access is requested per host. You can remove a host at any time from Settings or
the toolbar popup.

## For developers (unpacked build)

Requirements: Node.js 24.15+ on the 24.x line, or Node.js 26+, and npm.
CI and release builds use Node.js 24, as specified in `.node-version`.

The repository is currently private. Sign in with a GitHub account that has
access before cloning.

```sh
git clone https://github.com/mustafa-kamoona/tlp-mail-marker.git tlp-mail-marker
cd tlp-mail-marker
npm install
npm run build        # creates dist/
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `dist/` folder.
4. Add your webmail host in the extension settings as above.

### Rebuilding

```sh
npm run build          # production
npm run build:dev      # readable, with inline sourcemaps
```

Reload the extension from `chrome://extensions` after rebuilding.

### Firefox desktop (private testing)

```sh
npm run build:firefox       # creates dist-firefox/
npm run package:firefox     # unsigned Firefox ZIP + checksum
```

Firefox 140+ is required. Open `about:debugging#/runtime/this-firefox`, choose
**Load Temporary Add-on**, and select `dist-firefox/manifest.json`. For a ZIP,
unzip it first and select its `manifest.json`. Add your Roundcube hostname in
Settings and approve site access. Reload existing webmail tabs.

Temporary installation ends when Firefox closes. Permanent installation in
standard Firefox requires Mozilla signing. See [the Firefox guide](FIREFOX.md)
for the separate unlisted-signing decision.

### Packaging for the store

```sh
npm run release
```

This produces `release/tlp-mail-marker-<version>.zip`, a separate
`release/tlp-mail-marker-firefox-<version>.zip`,
`release/tlp-mail-marker-thunderbird-<version>.xpi`, and their `.sha256` checksums.
Do not upload a development build (it contains sourcemaps).

## Enabling the extension on a host

The extension declares no host access at install. When you add a host in
Settings, the browser asks you to grant access to that origin. Both `https` and
`http` origins can be authorised (for internal deployments); approve only the
scheme you actually use where possible.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No TLP selector in the composer | Is the host added and enabled? Is the composer actually open (not the message list)? Does the browser show the extension has access to the host? |
| Selector appears but the host is not Roundcube | Remove the host; the extension is a no-op on unsupported interfaces. |
| Marking not applied to the body | Ensure the round-trip through the editor completed; try selecting the level again. |
| Extension disabled after update | Re-open Settings; reload the webmail tab. |

## Uninstalling

Remove the extension from `chrome://extensions` or Firefox's `about:addons`.
All settings are deleted with
it; no data is kept elsewhere.
