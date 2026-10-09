import { describe, expect, it } from 'vitest';
import {
  LEGACY_TLP_WHITE,
  TLP_LEVELS,
  classifyChange,
  compareRestrictiveness,
  formatLevel,
  getDefinition,
  isDowngrade,
  isTlpLevel,
  isUpgrade,
  parseLevel,
  parseLevelWithLegacy,
  shortName,
} from '../../src/core/tlp.js';

describe('TLP model', () => {
  it('exposes exactly the five supported levels in order', () => {
    expect(TLP_LEVELS).toEqual([
      'TLP:CLEAR',
      'TLP:GREEN',
      'TLP:AMBER',
      'TLP:AMBER+STRICT',
      'TLP:RED',
    ]);
  });

  it('never includes the obsolete TLP:WHITE among supported levels', () => {
    expect(TLP_LEVELS).not.toContain(LEGACY_TLP_WHITE);
    expect(TLP_LEVELS.some((l) => l.includes('WHITE'))).toBe(false);
  });

  it('uses the official colour coding', () => {
    expect(getDefinition('TLP:RED').foreground).toBe('#FF2B2B');
    expect(getDefinition('TLP:AMBER').foreground).toBe('#FFC000');
    expect(getDefinition('TLP:GREEN').foreground).toBe('#33FF00');
    expect(getDefinition('TLP:CLEAR').foreground).toBe('#FFFFFF');
    for (const level of TLP_LEVELS) {
      expect(getDefinition(level).background).toBe('#000000');
    }
  });

  it('formats canonical tokens without spaces', () => {
    for (const level of TLP_LEVELS) {
      expect(formatLevel(level)).toBe(level);
      expect(level).not.toMatch(/\s/);
    }
    expect(shortName('TLP:AMBER+STRICT')).toBe('AMBER+STRICT');
  });
});

describe('parseLevel', () => {
  it('is case-insensitive and normalises whitespace', () => {
    expect(parseLevel('tlp:amber')).toBe('TLP:AMBER');
    expect(parseLevel(' TLP: GREEN ')).toBe('TLP:GREEN');
    expect(parseLevel('[TLP:RED]')).toBe('TLP:RED');
    expect(parseLevel('TLP : AMBER + STRICT')).toBe('TLP:AMBER+STRICT');
    // Common real-world spellings must keep the STRICT modifier.
    expect(parseLevel('TLP:AMBER STRICT')).toBe('TLP:AMBER+STRICT');
    expect(parseLevel('TLP:AMBER-STRICT')).toBe('TLP:AMBER+STRICT');
  });

  it('rejects the obsolete label', () => {
    expect(parseLevel('TLP:WHITE')).toBeNull();
    expect(parseLevelWithLegacy('TLP:WHITE')).toEqual({ level: 'TLP:CLEAR', legacy: true });
    expect(parseLevelWithLegacy('TLP:amber')).toEqual({ level: 'TLP:AMBER', legacy: false });
  });

  it('rejects malformed and unknown tokens', () => {
    expect(parseLevel('TLP:AMBERSTRICT')).toBeNull();
    expect(parseLevel('TLP:PURPLE')).toBeNull();
    expect(parseLevel('amber')).toBeNull();
    expect(parseLevel('')).toBeNull();
  });

  it('narrows unknown values', () => {
    expect(isTlpLevel('TLP:AMBER')).toBe(true);
    expect(isTlpLevel('TLP:WHITE')).toBe(false);
    expect(isTlpLevel(42)).toBe(false);
  });
});

describe('restrictiveness heuristic (advisory only)', () => {
  it('orders CLEAR < GREEN < AMBER < AMBER+STRICT < RED', () => {
    const order = ['TLP:CLEAR', 'TLP:GREEN', 'TLP:AMBER', 'TLP:AMBER+STRICT', 'TLP:RED'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(compareRestrictiveness(order[i]!, order[i - 1]!)).toBe(1);
    }
  });

  it('treats AMBER+STRICT as more restrictive than AMBER', () => {
    expect(isUpgrade('TLP:AMBER', 'TLP:AMBER+STRICT')).toBe(true);
    expect(isDowngrade('TLP:AMBER+STRICT', 'TLP:AMBER')).toBe(true);
  });

  it('classifies changes', () => {
    expect(classifyChange(null, 'TLP:AMBER')).toBe('set');
    expect(classifyChange('TLP:AMBER', 'TLP:AMBER')).toBe('unchanged');
    expect(classifyChange('TLP:AMBER', 'TLP:RED')).toBe('upgrade');
    expect(classifyChange('TLP:RED', 'TLP:GREEN')).toBe('downgrade');
  });
});
