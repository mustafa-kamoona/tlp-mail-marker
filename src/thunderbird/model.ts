import { applyHtmlMark, removeHtmlMark, readHtmlBodyText } from '../core/html-marking.js';
import { applySubjectMark, removeSubjectMark, applyPlainBodyMark, removePlainBodyMark } from '../core/marking.js';
import { detectEffectiveClassification, type ComposerIntent } from '../core/policy.js';
import { normalizeSettings, type Settings } from '../core/settings.js';
import { isTlpLevel, type TlpLevel } from '../core/tlp.js';
import { validateBeforeSend } from '../core/validation.js';
import type { ComposeDetails } from './api.js';

export interface ComposeContext { selected: TlpLevel | null; original: TlpLevel | null }

/** Parse in a template's inert document; email HTML is never displayed here. */
function htmlBody(html: string) {
  const shell = /^([\s\S]*?<body\b[^>]*>)([\s\S]*)(<\/body\s*>[\s\S]*)$/i.exec(html);
  const template = document.createElement('template');
  template.innerHTML = shell ? shell[2]! : html;
  return {
    root: template.content,
    serialize: () => shell ? `${shell[1]}${template.innerHTML}${shell[3]}` : template.innerHTML,
  };
}
export function bodyText(details: ComposeDetails): string {
  if (details.isPlainText) return details.plainTextBody ?? '';
  return readHtmlBodyText(htmlBody(details.body ?? '').root);
}
export function intent(details: ComposeDetails): ComposerIntent {
  return ['new', 'reply', 'forward', 'draft'].includes(details.type ?? '')
    ? details.type as ComposerIntent : 'unknown';
}
export function initialContext(details: ComposeDetails, settings: Settings): ComposeContext {
  const detected = detectEffectiveClassification({ subject: details.subject ?? '', body: bodyText(details) });
  return {
    selected: detected.level ?? (detected.conflicts.length === 0 && details.type === 'new' ? settings.defaultLevel : null),
    original: ['reply', 'forward'].includes(details.type ?? '') ? detected.level : null,
  };
}
export function readContext(value: unknown): ComposeContext | null {
  if (!value || typeof value !== 'object') return null;
  const context = value as ComposeContext;
  if (!(context.selected === null || isTlpLevel(context.selected)) || !(context.original === null || isTlpLevel(context.original))) return null;
  return { selected: context.selected, original: context.original };
}
export function thunderbirdSettings(value: unknown): Settings {
  // MailExtension permissions replace webmail host selection in this build.
  return { ...normalizeSettings(value), domains: [], allowUserDomains: false };
}
export function markDetails(details: ComposeDetails, level: TlpLevel | null, settings: Settings): ComposeDetails {
  const changes: ComposeDetails = {};
  if (settings.markSubject) changes.subject = level
    ? applySubjectMark(details.subject ?? '', level) : removeSubjectMark(details.subject ?? '');
  if (settings.markBody) {
    if (details.isPlainText) changes.plainTextBody = level
      ? applyPlainBodyMark(details.plainTextBody ?? '', level) : removePlainBodyMark(details.plainTextBody ?? '');
    else {
      const html = htmlBody(details.body ?? '');
      if (level) applyHtmlMark(html.root, html.root.ownerDocument, level, { colorCoding: settings.colorCoding });
      else removeHtmlMark(html.root);
      changes.body = html.serialize();
    }
  }
  return changes;
}
export function validate(details: ComposeDetails, context: ComposeContext, settings: Settings) {
  return validateBeforeSend({
    selectedLevel: context.selected, originalLevel: context.original,
    subject: details.subject ?? '', bodyText: bodyText(details), intent: intent(details), settings,
  });
}

/** One review authorizes exactly this message and configuration, once. */
export async function reviewDigest(details: ComposeDetails, context: ComposeContext, settings: Settings, attachments: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify({ details, context, settings, attachments }));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
