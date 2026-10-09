# Thunderbird

The Thunderbird add-on lives in this repository and shares the FIRST TLP 2.0
engine with the Roundcube browser extension. It has a separate manifest,
native compose integration, settings, and installable `.xpi` package.

## Install privately

Thunderbird **140 or newer** is required. The repository and its GitHub release
assets remain private; installation does not publish anything to an add-on store.

```sh
npm ci
npm run build:thunderbird
npm run package:thunderbird
```

In Thunderbird, open **Add-ons and Themes → Extensions → gear menu → Install
Add-on From File**, then select
`release/tlp-mail-marker-thunderbird-0.2.0.xpi`. Approve its compose and storage
permissions. The browser extension ZIP is a different package.

## Use

1. Open a message composer and click **TLP classification** in its toolbar.
   If the button is absent, use the toolbar's **Customize** menu to add it.
2. Choose the sharing boundary and select **Apply classification**. The add-on
   updates the subject and the plain-text or HTML body. Choose **No
   classification** to remove its leading markings.
3. Open **Settings** from that selector to configure a default for new messages,
   marking preferences, downgrade warnings, or missing-classification policy.
4. Send normally. A warning opens a separate review window. **Send anyway**
   authorizes that unchanged message once. Blocking errors cannot be overridden;
   return to the composer and fix the classification. Closing the review cancels
   that send attempt.

Classification state is independent for each open composer. Existing labels
are detected in drafts, replies and forwards; restrictive quoted labels also
participate in send validation. A default applies only to a new message.
Widening or removing a classification requires confirmation when downgrade
warnings are enabled. Confirm only with the original source's authorization.

## Optional original-message access

By default, detection uses the message being composed, including quoted text.
**Allow original-message access** in Settings requests Thunderbird's
`messagesRead` permission. This lets the add-on examine the source of a reply
or forward even when the quoted text was removed. Thunderbird grants this
permission broadly; the add-on only uses it for the related source message.
The same button can revoke the permission.

Without that permission, a removed classification may no longer be detectable
when reopening a draft or starting a reply with no quoted original text. The
add-on is a composition aid, not an enforcement mechanism or encryption.

## Privacy and scope

- Required permissions: `compose` and `storage`. Optional: `messagesRead`.
- No host access, network requests, remote code, telemetry, account credentials,
  or automatic sending. Thunderbird itself delivers mail normally.
- Settings stay in local profile storage. Only tab-associated selected/original
  TLP levels live in session storage; they are removed when the composer closes.
  Message content, recipients and attachments are never persisted by the add-on.
- The Thunderbird-specific controls are currently English. Shared TLP
  descriptions and validation messages use the existing translations.
- Browser host authorization and managed enterprise policy apply to the browser
  build. Thunderbird enterprise policy integration is not implemented.

## Runtime verification

Run the native integration suite against an installed Thunderbird executable:

```sh
npm run build:thunderbird
npm run package:thunderbird
THUNDERBIRD_BINARY=/path/to/thunderbird npm run e2e:thunderbird
```

The suite starts a disposable profile, synthetic accounts, and a loopback-only
SMTP server. A temporary copy of the production bundle gets automation-only
permissions and a driver; neither enters the shipped XPI. No personal profile
or production mailbox is used. Results appear under
`tests/thunderbird/artifacts/`. Linux CI uses Xvfb and a checksum-pinned official
Thunderbird ESR build. See [the compatibility matrix](COMPATIBILITY.md) for
executed versions and coverage limits.

## Shared organisation profiles

Use Settings to preview/import a JSON profile or export your approved levels,
default and missing-classification rule for the browser extension. See
[Organisation profiles](ORGANISATION-PROFILES.md) and the
[private beta checklist](BETA-TESTING.md).
