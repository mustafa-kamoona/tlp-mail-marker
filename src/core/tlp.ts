/**
 * Canonical FIRST TLP 2.0 model.
 *
 * This module is deliberately free of any DOM or browser dependency so it can
 * be reused by the service worker, content scripts, options page, and tests.
 *
 * Reference: FIRST Traffic Light Protocol 2.0 (https://www.first.org/tlp/).
 */

/** The four canonical TLP 2.0 labels plus the AMBER+STRICT modifier. */
export const TLP_LEVELS = [
  'TLP:CLEAR',
  'TLP:GREEN',
  'TLP:AMBER',
  'TLP:AMBER+STRICT',
  'TLP:RED',
] as const;

export type TlpLevel = (typeof TLP_LEVELS)[number];

/**
 * Obsolete TLP 1.0 label. Never emitted; recognised only so that legacy
 * markings can be reported and normalised.
 */
export const LEGACY_TLP_WHITE = 'TLP:WHITE' as const;

export interface TlpDefinition {
  readonly level: TlpLevel;
  /** Short name without the `TLP:` prefix, e.g. `AMBER`. */
  readonly name: string;
  /**
   * Restrictiveness rank used ONLY for advisory downgrade warnings.
   *
   * TLP is explicitly not a numeric security hierarchy. These ranks are a
   * documented heuristic to help a human notice when the audience appears to be
   * widened; they are not a claim about sharing semantics.
   */
  readonly rank: number;
  /** Official colour coding (font colour / background colour). */
  readonly foreground: string;
  readonly background: string;
  /** One-line description of sharing permissions. */
  readonly summary: string;
  /** Longer accessible description used as a tooltip. */
  readonly description: string;
}

const DEFINITIONS: Record<TlpLevel, TlpDefinition> = {
  'TLP:CLEAR': {
    level: 'TLP:CLEAR',
    name: 'CLEAR',
    rank: 0,
    foreground: '#FFFFFF',
    background: '#000000',
    summary: 'Can be shared with the world; no disclosure limit.',
    description:
      'TLP:CLEAR — Recipients may share this information with anyone, publicly or otherwise. Subject to standard copyright rules.',
  },
  'TLP:GREEN': {
    level: 'TLP:GREEN',
    name: 'GREEN',
    rank: 1,
    foreground: '#33FF00',
    background: '#000000',
    summary: 'Share within the community, not via public channels.',
    description:
      'TLP:GREEN — Recipients may share this with peers and partner organisations within their community, but not via publicly accessible channels.',
  },
  'TLP:AMBER': {
    level: 'TLP:AMBER',
    name: 'AMBER',
    rank: 2,
    foreground: '#FFC000',
    background: '#000000',
    summary: 'Share on a need-to-know basis within the organisation and its clients.',
    description:
      'TLP:AMBER — Recipients may share this on a need-to-know basis within their own organisation and its clients.',
  },
  'TLP:AMBER+STRICT': {
    level: 'TLP:AMBER+STRICT',
    name: 'AMBER+STRICT',
    rank: 3,
    foreground: '#FFC000',
    background: '#000000',
    summary: 'Share only within the organisation (no clients).',
    description:
      'TLP:AMBER+STRICT — Recipients may share this only with members of their own organisation on a need-to-know basis. Clients are excluded unless the source permits it.',
  },
  'TLP:RED': {
    level: 'TLP:RED',
    name: 'RED',
    rank: 4,
    foreground: '#FF2B2B',
    background: '#000000',
    summary: 'For the individual recipient only; no further disclosure.',
    description:
      'TLP:RED — For the eyes and ears of individual recipients only. Recipients may not share this information with anyone else.',
  },
};

export function getDefinition(level: TlpLevel): TlpDefinition {
  return DEFINITIONS[level];
}

export function isTlpLevel(value: unknown): value is TlpLevel {
  return typeof value === 'string' && (TLP_LEVELS as readonly string[]).includes(value);
}

/**
 * Normalise arbitrary user/message text into a canonical TLP level.
 *
 * Tolerant of case, surrounding whitespace, and spaces around `:` and `+`
 * (which real-world mail contains even though the standard forbids them). The
 * returned value is always canonical uppercase with no spaces.
 *
 * Returns `null` for anything that is not a known level. Use
 * {@link parseLevelWithLegacy} if you also need to detect `TLP:WHITE`.
 */
export function parseLevel(value: string): TlpLevel | null {
  const parsed = parseLevelWithLegacy(value);
  return parsed && !parsed.legacy ? parsed.level : null;
}

export interface ParsedLevel {
  level: TlpLevel;
  /** True when the input used the obsolete `TLP:WHITE` designation. */
  legacy: boolean;
}

export function parseLevelWithLegacy(value: string): ParsedLevel | null {
  if (typeof value !== 'string') {
    return null;
  }
  const cleaned = value.trim().replace(/^\[|\]$/g, '').trim();
  // `AMBER+STRICT` is the only canonical two-word level, but real mail also
  // contains `AMBER STRICT` and `AMBER-STRICT`. They are read as AMBER+STRICT
  // (the more restrictive reading) so the STRICT modifier is never dropped.
  const m = /^TLP\s*:\s*([A-Za-z]+(?:\s*[+\s-]\s*[A-Za-z]+)?)$/i.exec(cleaned);
  if (!m || !m[1]) {
    return null;
  }
  const body = m[1].replace(/\s*[+\s-]\s*/g, '+').toUpperCase();
  if (body === 'CLEAR' || body === 'GREEN' || body === 'AMBER' || body === 'AMBER+STRICT' || body === 'RED') {
    return { level: `TLP:${body}` as TlpLevel, legacy: false };
  }
  if (body === 'WHITE') {
    return { level: 'TLP:CLEAR', legacy: true };
  }
  return null;
}

/** Compare restrictiveness using the documented heuristic (see {@link TlpDefinition.rank}). */
export function compareRestrictiveness(a: TlpLevel, b: TlpLevel): number {
  return Math.sign(getDefinition(a).rank - getDefinition(b).rank);
}

/** True when `to` is less restrictive than `from` under the heuristic. */
export function isDowngrade(from: TlpLevel, to: TlpLevel): boolean {
  return compareRestrictiveness(to, from) < 0;
}

/** True when `to` is more restrictive than `from` under the heuristic. */
export function isUpgrade(from: TlpLevel, to: TlpLevel): boolean {
  return compareRestrictiveness(to, from) > 0;
}

export type ChangeKind = 'set' | 'unchanged' | 'upgrade' | 'downgrade';

export function classifyChange(from: TlpLevel | null, to: TlpLevel): ChangeKind {
  if (from == null) {
    return 'set';
  }
  const cmp = compareRestrictiveness(to, from);
  if (cmp === 0) {
    return 'unchanged';
  }
  return cmp < 0 ? 'downgrade' : 'upgrade';
}

/** Canonical token, e.g. `TLP:AMBER+STRICT`. */
export function formatLevel(level: TlpLevel): string {
  return level;
}

/** Short human label, e.g. `AMBER+STRICT`. */
export function shortName(level: TlpLevel): string {
  return getDefinition(level).name;
}
