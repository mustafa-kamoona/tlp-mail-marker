import { describe, expect, it } from 'vitest';
import { applyProfile, exportProfile, parseProfile, PROFILE_MAX_BYTES } from '../../src/core/profile.js';
import { normalizeSettings } from '../../src/core/settings.js';
import { applyManagedPolicy } from '../../src/core/managed.js';
import { validateBeforeSend } from '../../src/core/validation.js';

const profile = { format: 'tlp-mail-marker-profile', version: 1, name: 'Example team', settings: {
  allowedLevels: ['TLP:GREEN', 'TLP:AMBER'], defaultLevel: 'TLP:AMBER', missingClassification: 'block',
} };
describe('portable organisation profiles', () => {
  it('exports rules only, round-trips and works for both client settings', () => {
    const user = normalizeSettings({ ...profile.settings, domains: ['secret.example.com'], theme: 'dark', enabled: false });
    const text = exportProfile(user, 'Example team');
    expect(JSON.parse(text)).toEqual(profile);
    expect(text).not.toContain('secret.example.com');
    const parsed = parseProfile(text);
    const updated = applyProfile(user, parsed);
    expect(updated).toEqual(user);
    expect(applyProfile(normalizeSettings({}), parsed)).toMatchObject(profile.settings);
  });
  it.each([
    null, [], {}, { ...profile, version: 2 }, { ...profile, format: 'something-else' },
    { ...profile, name: '' }, { ...profile, name: 'x'.repeat(101) }, { ...profile, name: 'bad\nname' },
    { ...profile, domains: ['private.example.com'] },
    ...[
      { allowedLevels: [] }, { allowedLevels: ['TLP:WHITE'] }, { allowedLevels: ['TLP:RED', 'TLP:RED'] },
      { allowedLevels: ['TLP:GREEN', 'invalid'] }, { defaultLevel: 'TLP:RED' }, { defaultLevel: false },
      { missingClassification: 'mandatory' }, { enabled: true }, { __proto__: null, domains: [] },
    ].map(settings => ({ ...profile, settings: { ...profile.settings, ...settings } })),
  ])('rejects invalid policy instead of silently widening it: %j', input => {
    expect(() => parseProfile(JSON.stringify(input))).toThrow();
  });
  it('rejects malformed JSON and oversized UTF-8 input', () => {
    expect(() => parseProfile('{bad')).toThrow('valid JSON');
    expect(() => parseProfile(' '.repeat(PROFILE_MAX_BYTES + 1))).toThrow('16 KB');
    expect(() => parseProfile('ع'.repeat(PROFILE_MAX_BYTES))).toThrow('16 KB');
  });
  it('keeps permissions, domains, switches and appearance local, without mutating inputs', () => {
    const user = normalizeSettings({ domains: ['mail.example.com'], markBody: false, theme: 'dark', enabled: false });
    const before = JSON.stringify(user), parsed = parseProfile(JSON.stringify(profile));
    expect(applyProfile(user, parsed)).toMatchObject({ ...user, ...profile.settings });
    expect(JSON.stringify(user)).toBe(before);
    expect(parsed).toEqual(profile);
  });
  it('retains administrator controls even when the imported preset conflicts', () => {
    const user = normalizeSettings({ defaultLevel: 'TLP:RED', missingClassification: 'warn' });
    const policy = { allowedLevels: ['TLP:RED'] as const, defaultLevel: 'TLP:RED' as const, missingClassification: 'off' as const };
    const managed = { ...policy, allowedLevels: [...policy.allowedLevels] };
    const updated = applyProfile(user, parseProfile(JSON.stringify(profile)), managed);
    expect(updated).toEqual(user);
    expect(applyManagedPolicy(updated, managed)).toMatchObject(managed);
  });
  it('clears an incompatible user default when only approved levels are managed', () => {
    const user = normalizeSettings({});
    const updated = applyProfile(user, parseProfile(JSON.stringify(profile)), { allowedLevels: ['TLP:RED'] });
    expect(applyManagedPolicy(updated, { allowedLevels: ['TLP:RED'] }).defaultLevel).toBeNull();
  });
  it('blocks a previously selected level when a profile removes it', () => {
    const settings = applyProfile(normalizeSettings({}), parseProfile(JSON.stringify(profile)));
    const result = validateBeforeSend({ settings, selectedLevel: 'TLP:RED', originalLevel: null, intent: 'new', subject: '[TLP:RED] Draft', bodyText: 'TLP:RED\n\nDraft' });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([expect.objectContaining({ code: 'LEVEL_NOT_ALLOWED' })]);
  });
  it('blocks the old markings after a browser controller loses its selection, even with missing checks off', () => {
    const settings = { ...normalizeSettings({ allowedLevels: ['TLP:GREEN'] }), missingClassification: 'off' as const };
    const result = validateBeforeSend({ settings, selectedLevel: null, originalLevel: null, intent: 'new', subject: '[TLP:RED] Draft', bodyText: 'TLP:RED\n\nDraft' });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([expect.objectContaining({ code: 'LEVEL_NOT_ALLOWED', params: { level: 'TLP:RED' } })]);
  });
});
