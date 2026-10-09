import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FALLBACK_MESSAGES, t, tlpDescription, tlpSummary } from '../../src/utils/i18n.js';

const localesDir = fileURLToPath(new URL('../../_locales', import.meta.url));

function loadMessages(locale: string): Record<string, { message: string }> {
  const raw = readFileSync(`${localesDir}/${locale}/messages.json`, 'utf8');
  return JSON.parse(raw) as Record<string, { message: string }>;
}

describe('translation runtime', () => {
  it('falls back to English when chrome.i18n is unavailable', () => {
    expect(t('selectorTitle')).toBe('TLP classification');
    expect(t('confirmSend')).toBe('Send anyway');
  });

  it('applies {token} substitutions', () => {
    expect(t('detectedFromOriginal', { level: 'TLP:AMBER' })).toBe(
      'Preselected TLP:AMBER from the original message.',
    );
  });

  it('returns the key for unknown messages', () => {
    expect(t('does_not_exist')).toBe('does_not_exist');
  });

  it('localises TLP summaries and descriptions', () => {
    expect(tlpSummary('TLP:RED')).toMatch(/individual recipient/i);
    expect(tlpDescription('TLP:AMBER+STRICT')).toContain('TLP:AMBER+STRICT');
  });

  it('never translates canonical labels inside descriptions', () => {
    for (const level of ['TLP:CLEAR', 'TLP:GREEN', 'TLP:AMBER', 'TLP:AMBER+STRICT', 'TLP:RED'] as const) {
      expect(tlpDescription(level)).toContain(level);
    }
  });
});

describe('locale catalogues', () => {
  const en = loadMessages('en');
  const enKeys = Object.keys(en).sort();

  it('the English catalogue matches the built-in fallback exactly', () => {
    expect(enKeys).toEqual(Object.keys(FALLBACK_MESSAGES).sort());
    for (const key of enKeys) {
      expect(en[key]!.message).toBe(FALLBACK_MESSAGES[key]);
    }
  });

  it('every catalogue defines every key (no silent English gaps)', () => {
    const locales = readdirSync(localesDir).filter((name) => name !== 'en');
    expect(locales.length).toBeGreaterThan(0);
    for (const locale of locales) {
      const messages = loadMessages(locale);
      expect(Object.keys(messages).sort(), `${locale} keys`).toEqual(enKeys);
      for (const key of enKeys) {
        expect(messages[key]!.message.length, `${locale}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps TLP labels untranslated in every catalogue', () => {
    const locales = readdirSync(localesDir);
    for (const locale of locales) {
      const messages = loadMessages(locale);
      for (const key of ['tlpRedDesc', 'tlpAmberStrictDesc', 'tlpClearDesc', 'tlpGreenDesc', 'tlpAmberDesc']) {
        const text = messages[key]!.message;
        expect(text, `${locale}.${key}`).toMatch(/TLP:(CLEAR|GREEN|AMBER|AMBER\+STRICT|RED)/);
      }
    }
  });
});
