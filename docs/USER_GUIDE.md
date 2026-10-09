# User Guide

## What TLP Mail Marker does

It helps you add the correct **FIRST TLP 2.0** label to email you send from
Roundcube, and to notice when a reply or forward would lower the classification.

TLP is an information-sharing protocol. It says **how widely** the information
may be shared. It is not encryption and not access control.

## The classifications

| Label | Meaning | Sharing |
| --- | --- | --- |
| `TLP:CLEAR` | Minimal or no foreseeable risk. | May be shared with the world. |
| `TLP:GREEN` | Useful for awareness in the community. | Share within the community, not via public channels. |
| `TLP:AMBER` | Requires support to act on; risk if shared widely. | Need-to-know within your organisation **and its clients**. |
| `TLP:AMBER+STRICT` | As AMBER, but restricted further. | Need-to-know within your **organisation only** (clients excluded unless the source permits). |
| `TLP:RED` | Cannot be acted on without significant risk. | For the individual recipient only; no further disclosure. |

The selector shows the label text and a tooltip for each option. Colour is an
extra cue; the text label is always present and is what matters.

## Composing a message

1. Roundcube opens the composer. A **TLP classification** selector appears
   beneath the subject field.
2. Choose the appropriate level. The extension adds:
   - a subject prefix, for example `[TLP:AMBER] Your subject`, and
   - a marking at the top of the body, for example `TLP:AMBER` on the first
     line.
3. Write your message normally. The marking is kept up to date automatically as
   you change the selection. Signatures, quoted text, links and attachments are
   not touched.

Changing your mind is safe: selecting another level replaces the marking; it
never adds a second one. Choosing **Clear** removes the marking.

## Replying and forwarding

If the message you are replying to or forwarding already carries a TLP label,
the extension detects it and preselects it. By default the classification is
preserved.

If you try to **lower** the classification (for example `TLP:RED` → `TLP:GREEN`),
the extension warns you. TLP does not permit wider sharing without the source's
explicit permission. The warning is advisory: only continue if you are
authorised to do so. The extension never lowers a classification by itself.

## Sending

Before a message leaves the composer:

- if **no** classification is selected, the extension warns or blocks according
  to your setting;
- if the subject and body markings disagree, or a marking is malformed, the
  extension blocks or asks for confirmation;
- if you are lowering a classification, you are asked to confirm.

If something is wrong, you are shown what to fix and returned to the composer.
Messages that pass are sent normally.

## Drafts

Classifications are preserved when you save a draft, when drafts are saved
automatically, when you reopen them, and when you reload the page or switch
between HTML and plain-text modes.

## Settings

- **Enable / disable** the extension entirely.
- **Authorised webmail domains** — add the exact hostname of your Roundcube.
- **When sending without a classification** — *do nothing*, *warn*, or *block*.
- **Warn on downgrade** — turn the reply/forward downgrade warning on or off. It also controls the quoted-text warning: if the quoted thread contains a more restrictive label (for example `TLP:RED`) than the one you selected, you are asked to confirm before sending.
- **Markings & appearance** — include the subject label, include the body
  marking, use official TLP colours, and choose the interface theme.

Settings are stored only in your browser. No email content is stored.

## Important limitations

- These checks run in your browser and **can be bypassed**. They are not a
  substitute for server-side policy and are **not** a data-loss prevention
  system.
- The extension only recognises Roundcube. On other webmail it does nothing.
- It cannot know whether the original source authorised a downgrade; you remain
  responsible for obtaining permission where required.
- Only the text label is guaranteed to survive downstream mail systems; colour
  is an enhancement.

## Accessibility

- The selector uses native radio controls: arrow keys, Tab, and Enter work as
  expected, with a visible focus ring and screen-reader labels.
- Each option has a text label and a tooltip; classification is never conveyed
  by colour alone.
- The blocking and confirmation dialogs are modal, keyboard-navigable, and close
  with Escape.
