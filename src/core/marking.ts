/**
 * Marking transforms for the subject line and plain-text bodies.
 *
 * All transforms are pure string operations and idempotent: applying the same
 * marking twice yields the same result. Content other than the marking block is
 * preserved byte-for-byte (subject whitespace is collapsed only within the
 * subject, which email clients normalise anyway).
 */

import { TOKEN_SOURCE, leadingToken } from './parser.js';
import { type TlpLevel, formatLevel } from './tlp.js';

/** Bracketed subject marker, e.g. `[TLP:AMBER]`. */
export function subjectToken(level: TlpLevel): string {
  return `[${formatLevel(level)}]`;
}

const BRACKETED_TOKEN_RE = /\[\s*TLP\s*:\s*[A-Za-z]+(?:\s*[+\s-]\s*[A-Za-z]+)?\s*\]/gi;
const LEADING_BARE_RE = new RegExp(`^(\\s*(?:(?:re|fwd?|aw|wg|tr|sv)\\s*:\\s*)*)${TOKEN_SOURCE}`, 'i');
const TRAILING_BARE_RE = new RegExp(`${TOKEN_SOURCE}\\s*$`, 'i');

/**
 * Remove TLP marks from a subject line: bracketed tokens anywhere, plus bare
 * tokens at the start or end. A bare token in the middle is prose and is kept
 * (`How we handle TLP:RED data` must survive re-marking).
 */
export function stripSubjectMarks(subject: string): string {
  let out = subject.replace(BRACKETED_TOKEN_RE, ' ');
  for (let i = 0; i < 8; i++) {
    const next = out.replace(LEADING_BARE_RE, '$1 ').replace(TRAILING_BARE_RE, ' ');
    if (next === out) {
      break;
    }
    out = next;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Apply a subject marking, replacing any existing TLP token. The prefix is
 * placed at the very start of the subject so it is visible without scrolling.
 */
export function applySubjectMark(subject: string, level: TlpLevel): string {
  const base = stripSubjectMarks(subject);
  const token = subjectToken(level);
  return base.length > 0 ? `${token} ${base}` : token;
}

export function removeSubjectMark(subject: string): string {
  return stripSubjectMarks(subject);
}

/**
 * Remove a leading plain-text marking block.
 *
 * A marking block is: the leading TLP token, an optional closing bracket,
 * horizontal whitespace, and up to two line breaks that separate it from the
 * content. Content indentation beyond the separator is preserved.
 */
export function removePlainBodyMark(body: string): string {
  const token = leadingToken(body);
  if (!token) {
    return body;
  }
  let after = body.slice(token.index + token.raw.length);
  after = after.replace(/^[ \t]*[\]\)]?[ \t]*/, '');
  after = after.replace(/^(?:\r?\n){1,2}/, '');
  return after;
}

/**
 * Apply a plain-text marking. Produces `TLP:LEVEL` followed by a blank line and
 * the original content. Idempotent.
 */
export function applyPlainBodyMark(body: string, level: TlpLevel): string {
  const content = removePlainBodyMark(body);
  const marker = formatLevel(level);
  return content.length > 0 ? `${marker}\n\n${content}` : marker;
}

/** True when the body's leading block already carries `level`. */
export function hasPlainBodyMark(body: string, level: TlpLevel): boolean {
  return leadingToken(body)?.level === level;
}
