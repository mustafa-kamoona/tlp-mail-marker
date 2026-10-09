/**
 * UI internationalisation.
 *
 * Uses the standard `chrome.i18n` message catalogue (`_locales/<lang>/messages.json`).
 * The canonical TLP labels (`TLP:AMBER`, …) are NEVER translated — the standard
 * requires labels to remain in their original form. Only the surrounding UI is
 * localised.
 *
 * A built-in English fallback is used in contexts where `chrome.i18n` is not
 * available (unit/integration tests, non-extension pages) and for any key a
 * translation omits.
 */

import { type TlpLevel, getDefinition } from '../core/tlp.js';

export const FALLBACK_MESSAGES: Record<string, string> = {
  // Manifest
  appName: 'TLP Mail Marker',
  appDesc: 'Apply FIRST TLP 2.0 markings to outgoing email in Roundcube Webmail. No tracking, no external servers.',
  actionTitle: 'TLP Mail Marker',

  // Selector
  selectorTitle: 'TLP classification',
  selectorHint: 'FIRST TLP 2.0',
  selectorGroupLabel: 'Traffic Light Protocol classification',
  selectorOptionLabel: '{level} — {summary}',
  selectorClear: 'Clear',
  selectorClearTitle: 'Remove the TLP classification from this message',
  selectorNone: 'No classification selected.',
  detectedFromOriginal: 'Preselected {level} from the original message.',
  detectedDefault: 'Default classification {level} applied by policy.',
  warningConflicts: 'Conflicting classifications found ({levels}). Choose one explicitly.',
  warningLegacyWhite: 'This conversation uses the obsolete TLP:WHITE. It should be TLP:CLEAR.',
  warningOriginalNotAllowed: 'The original message is classified {level}, which is not permitted by policy. Choose an allowed classification.',
  warningDowngrade: "Lowering from {from} to {to}. Wider sharing needs the source's permission.",

  // Dialogs
  dialogClose: 'Close',
  blockTitle: 'Add a TLP classification',
  blockSubtitle: 'This message was not sent.',
  blockMessage: 'Choose a classification so the subject and body clearly show the sharing boundary.',
  blockAction: 'Choose a classification',
  confirmDowngradeTitle: 'Lower the TLP classification?',
  confirmDowngradeSubtitle: 'This widens who may receive the information.',
  confirmTitle: 'Send with warnings?',
  confirmMessage: 'Review the following before sending:',
  confirmSend: 'Send anyway',
  confirmBack: 'Go back',

  // Validation issues
  issue_LEVEL_NOT_ALLOWED: '{level} is no longer approved. Choose an approved classification before sending.',
  issue_NO_CLASSIFICATION: 'This message has no TLP classification.',
  issue_SUBJECT_NOT_MARKED: 'The subject is not marked with {level}.',
  issue_SUBJECT_MISMATCH: 'The subject is marked {actual} but {level} was selected.',
  issue_SUBJECT_CONFLICT: 'The subject contains conflicting TLP classifications.',
  issue_SUBJECT_DUPLICATE: 'The subject contains more than one {level} marking.',
  issue_BODY_NOT_MARKED: 'The message body has no {level} marking.',
  issue_BODY_MISMATCH: 'The message body leads with {actual} but {level} was selected.',
  issue_BODY_AMBIGUOUS: 'The message body contains conflicting TLP classifications without a clear leading mark.',
  issue_DOWNGRADE: "You are lowering the classification from {from} to {to}. TLP does not permit wider sharing without the source's explicit permission. Only continue if you are authorised to do so.",
  issue_QUOTED_HIGHER: 'The quoted text contains {quoted}, which is more restrictive than the selected {level}. Quoting it here may share that information more widely than its source allows.',
  issue_LEGACY_WHITE: 'This conversation contains the obsolete TLP:WHITE designation. It should be TLP:CLEAR.',

  // TLP summaries
  tlpClearSummary: 'Can be shared with the world; no disclosure limit.',
  tlpGreenSummary: 'Share within the community, not via public channels.',
  tlpAmberSummary: 'Share on a need-to-know basis within the organisation and its clients.',
  tlpAmberStrictSummary: 'Share only within the organisation (no clients).',
  tlpRedSummary: 'For the individual recipient only; no further disclosure.',
  tlpClearDesc: 'TLP:CLEAR — Recipients may share this information with anyone, publicly or otherwise. Subject to standard copyright rules.',
  tlpGreenDesc: 'TLP:GREEN — Recipients may share this with peers and partner organisations within their community, but not via publicly accessible channels.',
  tlpAmberDesc: 'TLP:AMBER — Recipients may share this on a need-to-know basis within their own organisation and its clients.',
  tlpAmberStrictDesc: 'TLP:AMBER+STRICT — Recipients may share this only with members of their own organisation on a need-to-know basis. Clients are excluded unless the source permits it.',
  tlpRedDesc: 'TLP:RED — For the eyes and ears of individual recipients only. Recipients may not share this information with anyone else.',

  // Options
  optHeadingGeneral: 'General',
  optEnable: 'Enable TLP Mail Marker',
  optGeneralHint: 'The extension only runs on the webmail domains you authorise below. It never sends data anywhere.',
  optHeadingDomains: 'Authorised webmail domains',
  optDomainsHint: 'Add the exact hostname of your Roundcube instance (for example mail.example.gov). Access is requested per domain. Nothing is enabled until you approve the browser prompt.',
  optDomainPlaceholder: 'mail.example.gov',
  optAddDomain: 'Add domain',
  optHeadingBehaviour: 'Classification behaviour',
  optMissingLabel: 'When sending without a classification',
  optMissingOff: 'Do nothing',
  optMissingWarn: 'Warn me (I can continue)',
  optMissingBlock: 'Block sending until one is selected',
  optWarnDowngrade: 'Warn when a reply or forward lowers the classification',
  optBehaviourHint: "TLP does not permit wider sharing without the source's explicit permission. Downgrades are warned about, never performed silently.",
  optHeadingMarking: 'Markings & appearance',
  optMarkSubject: 'Add the TLP label to the subject line (e.g. [TLP:AMBER] …)',
  optMarkBody: 'Add the TLP label at the top of the message body',
  optColorCoding: 'Use official TLP colour coding (the text label is always shown)',
  optThemeLabel: 'Interface theme',
  optThemeAuto: 'Match system',
  optThemeLight: 'Light',
  optThemeDark: 'Dark',
  optHeadingPrivacy: 'Privacy',
  optPrivacy1: 'No telemetry, analytics, tracking, or external APIs.',
  optPrivacy2: 'No email content, recipients, or attachments are read for anything but on-screen marking, and none are stored.',
  optPrivacy3: 'Settings are stored only in this browser profile (storage.local).',
  optPrivacy4: 'No remote code and no dynamic evaluation.',
  optPrivacyHint: 'Browser-side checks are advisory: they can be bypassed and are not a substitute for server-side policy or data-loss prevention.',
  optManagedBannerTitle: 'Managed by your administrator.',
  optManagedBannerText: 'Locked settings and hosts are configured by policy and cannot be changed here.',
  optManagedTag: '(managed)',
  optNoDomains: 'No domains authorised yet.',
  optStatusInvalidDomain: 'Enter a valid hostname, for example mail.example.gov',
  optStatusAlready: '{host} is already in the list.',
  optStatusDenied: 'Permission was not granted.',
  optStatusAdded: '{host} added.',
  optStatusRemoved: '{host} removed.',
  optStatusManaged: 'Your administrator manages the host list.',
  optRemove: 'Remove',
  optEnableHost: 'Enable on {host}',
  optVersion: 'Version {version}',
  srWebmailHostname: 'Webmail hostname',

  // Popup
  popupChecking: 'Checking this page…',
  popupSettings: 'Settings',
  popupLegendHeading: 'FIRST TLP 2.0',
  popupFootnote: 'No tracking. No external servers. Settings stay in this browser profile.',
  popupNotWebPage: 'This page is not a supported web page.',
  popupActiveManaged: 'Active on {host} (managed by policy).',
  popupActive: 'Active on {host}.',
  popupRemoveAccess: 'Remove access',
  popupNotAuthorisedManaged: 'Not authorised on {host}. Your administrator manages the host list.',
  popupNotAuthorised: 'Not authorised on {host}.',
  popupAuthorise: 'Authorise this site',
  popupPermissionDenied: 'Permission was not granted.',
};

function applySubstitutions(message: string, substitutions?: Record<string, string>): string {
  if (!substitutions) {
    return message;
  }
  let result = message;
  for (const [key, value] of Object.entries(substitutions)) {
    result = result.split(`{${key}}`).join(value);
  }
  return result;
}

function chromeMessage(key: string): string | null {
  try {
    const g = globalThis as unknown as { chrome?: { i18n?: { getMessage?: (k: string) => string } } };
    const value = g.chrome?.i18n?.getMessage?.(key);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Translate a message key, with English fallback and `{token}` substitution. */
export function t(key: string, substitutions?: Record<string, string>): string {
  const message = chromeMessage(key) ?? FALLBACK_MESSAGES[key] ?? key;
  return applySubstitutions(message, substitutions);
}

const SUMMARY_KEYS: Record<TlpLevel, string> = {
  'TLP:CLEAR': 'tlpClearSummary',
  'TLP:GREEN': 'tlpGreenSummary',
  'TLP:AMBER': 'tlpAmberSummary',
  'TLP:AMBER+STRICT': 'tlpAmberStrictSummary',
  'TLP:RED': 'tlpRedSummary',
};

const DESC_KEYS: Record<TlpLevel, string> = {
  'TLP:CLEAR': 'tlpClearDesc',
  'TLP:GREEN': 'tlpGreenDesc',
  'TLP:AMBER': 'tlpAmberDesc',
  'TLP:AMBER+STRICT': 'tlpAmberStrictDesc',
  'TLP:RED': 'tlpRedDesc',
};

export function tlpSummary(level: TlpLevel): string {
  const key = SUMMARY_KEYS[level];
  const message = chromeMessage(key) ?? FALLBACK_MESSAGES[key];
  return message ?? getDefinition(level).summary;
}

export function tlpDescription(level: TlpLevel): string {
  const key = DESC_KEYS[level];
  const message = chromeMessage(key) ?? FALLBACK_MESSAGES[key];
  return message ?? getDefinition(level).description;
}

/** Fill `data-i18n*` attributes in a document or fragment. */
export function localizeDocument(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    element.textContent = t(element.getAttribute('data-i18n')!);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((element) => {
    element.setAttribute('placeholder', t(element.getAttribute('data-i18n-placeholder')!));
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((element) => {
    element.setAttribute('title', t(element.getAttribute('data-i18n-title')!));
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((element) => {
    element.setAttribute('aria-label', t(element.getAttribute('data-i18n-aria-label')!));
  });
}
