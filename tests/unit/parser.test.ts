import { describe, expect, it } from 'vitest';
import {
  analyzeBody,
  analyzeSubject,
  distinctLevels,
  findTokens,
  hasLegacyWhite,
  leadingToken,
  quotedLevels,
} from '../../src/core/parser.js';

describe('findTokens', () => {
  it('finds tokens case-insensitively', () => {
    const tokens = findTokens('Re: [tlp:amber] and TLP:GREEN');
    expect(tokens.map((t) => t.level)).toEqual(['TLP:AMBER', 'TLP:GREEN']);
  });

  it('finds AMBER+STRICT with optional spaces', () => {
    expect(findTokens('TLP:AMBER+STRICT')[0]?.level).toBe('TLP:AMBER+STRICT');
    expect(findTokens('TLP: AMBER + STRICT')[0]?.level).toBe('TLP:AMBER+STRICT');
  });

  it('does not match malformed tokens like TLP:AMBERSTRICT', () => {
    expect(findTokens('TLP:AMBERSTRICT')).toHaveLength(0);
  });

  it('reads AMBER STRICT and AMBER-STRICT as AMBER+STRICT, never plain AMBER', () => {
    expect(findTokens('[TLP:AMBER STRICT] x')[0]?.level).toBe('TLP:AMBER+STRICT');
    expect(findTokens('[TLP:AMBER-STRICT] x')[0]?.level).toBe('TLP:AMBER+STRICT');
    expect(analyzeSubject('[TLP:AMBER STRICT] report').level).toBe('TLP:AMBER+STRICT');
  });

  it('still reads plain AMBER when STRICT is only part of a longer word', () => {
    expect(findTokens('TLP:AMBER STRICTLY internal')[0]?.level).toBe('TLP:AMBER');
  });

  it('requires a boundary before the token (FOOTLP:RED is not a token)', () => {
    expect(findTokens('FOOTLP:RED')).toHaveLength(0);
    expect(analyzeSubject('[TLP:GREEN] FOOTLP:RED x').level).toBe('TLP:GREEN');
  });

  it('does not match without the TLP prefix', () => {
    expect(findTokens('amber and green')).toHaveLength(0);
  });

  it('recognises the legacy WHITE token', () => {
    expect(hasLegacyWhite('TLP:WHITE')).toBe(true);
    expect(hasLegacyWhite('TLP:CLEAR')).toBe(false);
  });
});

describe('distinctLevels', () => {
  it('returns unique levels in first-seen order', () => {
    expect(distinctLevels('TLP:AMBER TLP:GREEN TLP:AMBER')).toEqual(['TLP:AMBER', 'TLP:GREEN']);
  });
});

describe('analyzeSubject', () => {
  it('returns the single level', () => {
    const result = analyzeSubject('Re: [TLP:AMBER] Incident');
    expect(result.level).toBe('TLP:AMBER');
    expect(result.conflicted).toBe(false);
    expect(result.duplicated).toBe(false);
  });

  it('detects conflicts', () => {
    const result = analyzeSubject('[TLP:AMBER] [TLP:RED] Incident');
    expect(result.level).toBeNull();
    expect(result.conflicted).toBe(true);
  });

  it('detects duplicates of the same level', () => {
    const result = analyzeSubject('[TLP:AMBER] Inc [TLP:AMBER]');
    expect(result.level).toBe('TLP:AMBER');
    expect(result.duplicated).toBe(true);
    expect(result.conflicted).toBe(false);
  });
});

describe('analyzeSubject: prose vs marks', () => {
  it('ignores a bare mid-subject token when a real mark is present', () => {
    const result = analyzeSubject('[TLP:AMBER] How we handle TLP:RED data');
    expect(result.level).toBe('TLP:AMBER');
    expect(result.conflicted).toBe(false);
  });

  it('still detects a classification that appears only in prose (never misses one)', () => {
    expect(analyzeSubject('Update on TLP:RED report today').level).toBe('TLP:RED');
  });

  it('treats leading (after Re:/Fwd:) and trailing bare tokens as marks', () => {
    expect(analyzeSubject('Re: TLP:GREEN weekly digest').level).toBe('TLP:GREEN');
    expect(analyzeSubject('weekly digest TLP:GREEN').level).toBe('TLP:GREEN');
  });
});

describe('leadingToken', () => {
  it('finds a token at the very start', () => {
    expect(leadingToken('TLP:RED\n\nbody')?.level).toBe('TLP:RED');
  });

  it('tolerates a bracketed and whitespace-prefixed token', () => {
    expect(leadingToken('  [TLP:GREEN] body')?.level).toBe('TLP:GREEN');
  });

  it('does not treat a mid-text token as leading', () => {
    expect(leadingToken('Hello TLP:RED')).toBeNull();
    expect(leadingToken('Re: TLP:RED')).toBeNull();
  });
});

describe('analyzeBody', () => {
  it('reports the leading level and preserves quotes', () => {
    const body = 'TLP:AMBER\n\nNew text\n\n> Quoted original\n> TLP:GREEN';
    const result = analyzeBody(body);
    expect(result.leadingLevel).toBe('TLP:AMBER');
    expect(result.levels).toEqual(['TLP:AMBER', 'TLP:GREEN']);
    expect(result.conflicted).toBe(true);
  });

  it('handles a body with no marking', () => {
    const result = analyzeBody('Just a message');
    expect(result.leadingLevel).toBeNull();
    expect(result.levels).toEqual([]);
    expect(result.conflicted).toBe(false);
  });
});

describe('quotedLevels', () => {
  it('finds levels only inside quoted lines, at any depth', () => {
    const body = 'TLP:GREEN\n\nMy text mentions TLP:AMBER\n\n> TLP:RED\n> >  older TLP:AMBER+STRICT';
    expect(quotedLevels(body)).toEqual(['TLP:RED', 'TLP:AMBER+STRICT']);
  });

  it('returns nothing for an unquoted body', () => {
    expect(quotedLevels('TLP:RED\n\nno quotes here')).toEqual([]);
    expect(quotedLevels('')).toEqual([]);
  });
});
