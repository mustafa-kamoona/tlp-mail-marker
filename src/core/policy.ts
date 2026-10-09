/**
 * Classification policy: how the extension decides which TLP level applies to
 * the message currently being composed, and how it reacts to changes.
 *
 * These are explicit, documented policy decisions. TLP sharing permissions are
 * not a universal numeric hierarchy, so the extension never silently changes a
 * classification and never assumes the originator authorised a downgrade.
 */

import { analyzeBody, analyzeSubject } from './parser.js';
import { type TlpLevel, classifyChange, type ChangeKind, getDefinition } from './tlp.js';

export type DetectionSource = 'subject' | 'body-leading' | 'body-consensus' | 'none';

export interface EffectiveClassification {
  readonly level: TlpLevel | null;
  readonly source: DetectionSource;
  /** Levels that could not be reconciled, in first-seen order. */
  readonly conflicts: TlpLevel[];
  /** True when legacy `TLP:WHITE` was observed in the analysed text. */
  readonly legacyWhite: boolean;
}

/**
 * Determine the effective classification of a message from its subject and
 * body text.
 *
 * Precedence (documented policy):
 *  1. A single unambiguous subject marking is authoritative.
 *  2. Otherwise, a single unambiguous leading body marking.
 *  3. Otherwise, consensus across all body markings.
 *  4. Otherwise no reliable level (conflict) — the user must choose.
 *
 * Conflicts (multiple distinct levels at the same precedence) are reported and
 * never auto-resolved.
 */
export function detectEffectiveClassification(input: {
  subject: string;
  body: string;
}): EffectiveClassification {
  const subject = analyzeSubject(input.subject);
  const body = analyzeBody(input.body);
  const legacyWhite = subject.tokens.some((t) => t.legacy) || body.tokens.some((t) => t.legacy);

  if (subject.level) {
    return {
      level: subject.level,
      source: 'subject',
      conflicts: subject.conflicted ? subject.levels : [],
      legacyWhite,
    };
  }
  if (subject.conflicted) {
    return { level: null, source: 'none', conflicts: subject.levels, legacyWhite };
  }

  if (body.leadingLevel) {
    return { level: body.leadingLevel, source: 'body-leading', conflicts: [], legacyWhite };
  }

  if (body.levels.length === 1) {
    return { level: body.levels[0]!, source: 'body-consensus', conflicts: [], legacyWhite };
  }
  if (body.levels.length > 1) {
    return { level: null, source: 'none', conflicts: body.levels, legacyWhite };
  }

  return { level: null, source: 'none', conflicts: [], legacyWhite };
}

export type ComposerIntent = 'new' | 'reply' | 'reply-all' | 'forward' | 'draft' | 'unknown';

/**
 * Infer the composer intent from public URL parameters (stable Roundcube
 * contract) without touching page JavaScript.
 */
export function intentFromSearch(search: string): ComposerIntent {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return 'unknown';
  }
  if (params.get('_draft_uid') || params.get('_draft_id')) {
    return 'draft';
  }
  if (
    params.get('_forward_uid') ||
    params.get('_forward_inline') ||
    (params.get('_uid') && params.get('_action') === 'forward')
  ) {
    return 'forward';
  }
  if (params.get('_reply_uid')) {
    const all = params.get('_all');
    if (all === 'all') {
      return 'reply-all';
    }
    return 'reply';
  }
  if (params.get('_action') === 'compose') {
    return 'new';
  }
  return 'unknown';
}

export function isReplyOrForward(intent: ComposerIntent): boolean {
  return intent === 'reply' || intent === 'reply-all' || intent === 'forward';
}

/**
 * Determine composer intent.
 *
 * The authoritative source is `rcmail.env.compose_mode`, published by the
 * MAIN-world probe as `data-tlp-compose-mode`. Roundcube rewrites the compose
 * URL (e.g. `_reply_uid` is replaced by an opaque `_id`), so URL parameters
 * alone are not reliable; they remain a fallback for environments where the
 * probe has not run (e.g. the extension loaded after the page).
 */
export function intentFromDocument(doc: Document, search: string): ComposerIntent {
  const root = doc?.documentElement;
  const attr = root?.getAttribute('data-tlp-compose-mode');
  if (attr) {
    const value = attr.toLowerCase();
    if (value === 'reply') return 'reply';
    if (value === 'reply-all') return 'reply-all';
    if (value === 'forward') return 'forward';
    if (value === 'draft') return 'draft';
    if (value === 'new') return 'new';
  }
  if (root?.getAttribute('data-tlp-draft-id') || root?.getAttribute('data-tlp-draft-uid')) {
    return 'draft';
  }
  return intentFromSearch(search);
}

/**
 * Policy for how a newly-detected classification should be presented when a
 * composer opens or new content is detected.
 *
 * We always preserve the source classification by default and never downgrade
 * silently. Whether a change is allowed is the user's decision.
 */
export interface ChangeAssessment {
  readonly kind: ChangeKind;
  readonly from: TlpLevel | null;
  readonly to: TlpLevel;
  /** Human-readable advice, or null when no action is needed. */
  readonly advice: string | null;
  /** True when the change widens the audience under the restrictiveness heuristic. */
  readonly isDowngrade: boolean;
}

export function assessChange(from: TlpLevel | null, to: TlpLevel): ChangeAssessment {
  const kind = classifyChange(from, to);
  if (kind === 'downgrade') {
    const fromName = from ? getDefinition(from).name : '';
    return {
      kind,
      from,
      to,
      isDowngrade: true,
      advice:
        `You are lowering the classification from ${fromName} to ${getDefinition(to).name}. ` +
        'TLP does not allow wider sharing without the source\'s explicit permission. ' +
        'Only continue if you are authorised to do so.',
    };
  }
  if (kind === 'upgrade') {
    return {
      kind,
      from,
      to,
      isDowngrade: false,
      advice: `You are raising the classification to ${getDefinition(to).name}.`,
    };
  }
  return { kind, from, to, isDowngrade: false, advice: null };
}
