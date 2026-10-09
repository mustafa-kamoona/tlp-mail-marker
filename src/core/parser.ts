/**
 * TLP token parsing.
 *
 * Pure text analysis: no DOM, no browser APIs. Used to detect existing
 * classifications in a subject line or message body, including adversarial
 * content, without ever trusting or rendering that content.
 */

import { type ParsedLevel, type TlpLevel, parseLevelWithLegacy } from './tlp.js';

export interface TlpToken {
  readonly level: TlpLevel;
  /** True when the token used obsolete `TLP:WHITE`. */
  readonly legacy: boolean;
  /** The exact matched substring. */
  readonly raw: string;
  /** Index of the match within the analysed text. */
  readonly index: number;
}

/**
 * Source of the TLP token pattern, shared with the marking transforms so that
 * detection and stripping can never disagree about what a token is.
 *
 * Tolerant of case and whitespace around `:`; `AMBER+STRICT` may also be
 * written `AMBER STRICT` or `AMBER-STRICT`. Boundaries on both sides stop
 * `FOOTLP:RED` and `TLP:AMBERSTRICT` from being read as tokens.
 */
export const TOKEN_SOURCE =
  '(?<![A-Za-z0-9])TLP\\s*:\\s*(?:CLEAR|GREEN|AMBER\\s*[+\\s-]\\s*STRICT|AMBER|RED|WHITE)(?![A-Za-z0-9+])';

const TOKEN_RE = new RegExp(TOKEN_SOURCE, 'gi');

/** Find every TLP token in arbitrary text. */
export function findTokens(text: string): TlpToken[] {
  if (!text) {
    return [];
  }
  const tokens: TlpToken[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const parsed: ParsedLevel | null = parseLevelWithLegacy(m[0]);
    if (parsed) {
      tokens.push({
        level: parsed.level,
        legacy: parsed.legacy,
        raw: m[0],
        index: m.index,
      });
    }
    // Guard against zero-length matches (not possible with this pattern, but
    // keeps the loop strictly progress-making).
    if (m.index === TOKEN_RE.lastIndex) {
      TOKEN_RE.lastIndex++;
    }
  }
  return tokens;
}

/** Distinct canonical levels present in the text, in first-seen order. */
export function distinctLevels(text: string): TlpLevel[] {
  const seen = new Set<TlpLevel>();
  const out: TlpLevel[] = [];
  for (const token of findTokens(text)) {
    if (!seen.has(token.level)) {
      seen.add(token.level);
      out.push(token.level);
    }
  }
  return out;
}

export function hasLegacyWhite(text: string): boolean {
  return findTokens(text).some((t) => t.legacy);
}

export interface SubjectAnalysis {
  readonly raw: string;
  readonly tokens: TlpToken[];
  readonly levels: TlpLevel[];
  /** The level if exactly one distinct level is present, otherwise null. */
  readonly level: TlpLevel | null;
  /** True when more than one distinct level is present. */
  readonly conflicted: boolean;
  /** True when the same level appears more than once. */
  readonly duplicated: boolean;
}

const REPLY_PREFIX = '(?:(?:re|fwd?|aw|wg|tr|sv)\\s*:\\s*)*';
const LEADING_POSITION_RE = new RegExp(`^\\s*${REPLY_PREFIX}[\\[(]?\\s*$`, 'i');

/**
 * True when a token sits where a classification mark is expected in a subject:
 * in brackets anywhere, at the start (after optional `Re:`/`Fwd:` prefixes), or
 * at the end. A bare token in the middle (`How we handle TLP:RED data`) is
 * prose, not a mark.
 */
export function isSubjectMark(text: string, token: TlpToken): boolean {
  const before = text.slice(0, token.index);
  const after = text.slice(token.index + token.raw.length);
  if (/\[\s*$/.test(before) && /^\s*\]/.test(after)) {
    return true;
  }
  return LEADING_POSITION_RE.test(before) || /^\s*[\])]?\s*$/.test(after);
}

export function analyzeSubject(subject: string): SubjectAnalysis {
  const tokens = findTokens(subject);
  // Prefer tokens in marking position. If there are none, fall back to every
  // token so a classification buried in prose is still detected, never missed.
  const marks = tokens.filter((t) => isSubjectMark(subject, t));
  const effective = marks.length > 0 ? marks : tokens;
  const seen = new Set<TlpLevel>();
  const levels: TlpLevel[] = [];
  const counts = new Map<TlpLevel, number>();
  for (const t of effective) {
    counts.set(t.level, (counts.get(t.level) ?? 0) + 1);
    if (!seen.has(t.level)) {
      seen.add(t.level);
      levels.push(t.level);
    }
  }
  return {
    raw: subject,
    tokens,
    levels,
    level: levels.length === 1 ? levels[0]! : null,
    conflicted: levels.length > 1,
    duplicated: [...counts.values()].some((c) => c > 1),
  };
}

export interface BodyAnalysis {
  readonly raw: string;
  readonly tokens: TlpToken[];
  readonly levels: TlpLevel[];
  /**
   * The level found in the leading marking block (the first non-empty line),
   * if any. This is the label that applies to the new message body.
   */
  readonly leadingLevel: TlpLevel | null;
  /** True when the same level appears more than once anywhere in the body. */
  readonly duplicated: boolean;
  /** True when more than one distinct level appears anywhere in the body. */
  readonly conflicted: boolean;
}

/**
 * Determine whether the leading, non-whitespace content of `text` starts with a
 * TLP marker. Leading bracket characters and whitespace are tolerated.
 */
export function leadingToken(text: string): TlpToken | null {
  const tokens = findTokens(text);
  for (const token of tokens) {
    const before = text.slice(0, token.index);
    // Only whitespace and a single opening bracket may precede a leading mark.
    if (/^[\s]*[\[(]?[\s]*$/.test(before)) {
      return token;
    }
    break; // tokens are ordered; the first one is not leading => none is
  }
  return null;
}

/**
 * Remove a leading marking block from plain text.
 *
 * Removes the leading TLP token, an optional matching closing bracket, and the
 * whitespace/newlines immediately after it, so that a fresh canonical marker
 * can be prepended without accumulating blank lines. Content is otherwise
 * untouched.
 */
export function stripLeadingBlock(text: string): string {
  const token = leadingToken(text);
  if (!token) {
    return text;
  }
  const before = text.slice(0, token.index);
  let after = text.slice(token.index + token.raw.length);
  // Consume an optional closing bracket and following horizontal whitespace.
  after = after.replace(/^[\s]*[\])\]]?[ \t]*/, '');
  // Consume at most one blank-line separator that belongs to the marking.
  after = after.replace(/^(?:\r?\n)+/, '');
  return (before.trimEnd() + (before.trim().length ? '\n' : '') + after.replace(/^\s+/, '')).replace(/^\s+/, '');
}

/**
 * Distinct levels found inside quoted text (lines starting with `>`, at any
 * nesting depth), in first-seen order. Quoted text is the part of a reply or
 * forward that the user did not write, so its classification is the one most
 * likely to be forgotten.
 */
export function quotedLevels(body: string): TlpLevel[] {
  const seen = new Set<TlpLevel>();
  const out: TlpLevel[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!/^\s*>/.test(line)) {
      continue;
    }
    for (const token of findTokens(line.replace(/^[\s>]+/, ''))) {
      if (!seen.has(token.level)) {
        seen.add(token.level);
        out.push(token.level);
      }
    }
  }
  return out;
}

export function analyzeBody(body: string): BodyAnalysis {
  const tokens = findTokens(body);
  const levels = distinctLevels(body);
  const counts = new Map<TlpLevel, number>();
  for (const t of tokens) {
    counts.set(t.level, (counts.get(t.level) ?? 0) + 1);
  }
  const lead = leadingToken(body);
  return {
    raw: body,
    tokens,
    levels,
    leadingLevel: lead ? lead.level : null,
    duplicated: [...counts.values()].some((c) => c > 1),
    conflicted: levels.length > 1,
  };
}
