import { describe, expect, it } from 'vitest';
import {
  applyManagedPolicy,
  managedLockedKeys,
  normalizeManagedPolicy,
} from '../../src/core/managed.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/core/settings.js';

describe('normalizeManagedPolicy', () => {
  it('returns an empty policy for missing or invalid input', () => {
    expect(normalizeManagedPolicy(undefined)).toEqual({});
    expect(normalizeManagedPolicy('nonsense')).toEqual({});
    expect(normalizeManagedPolicy({})).toEqual({});
  });

  it('keeps valid values and discards invalid ones', () => {
    const policy = normalizeManagedPolicy({
      enabled: false,
      missingClassification: 'block',
      warnOnDowngrade: false,
      markSubject: true,
      allowedLevels: ['TLP:AMBER', 'TLP:NOPE', 'TLP:RED', 'TLP:AMBER'],
      defaultLevel: 'TLP:GREEN',
      allowUserDomains: false,
      domains: ['https://mail.example.gov/inbox', 'not a host', '*'],
      unknownKey: 'ignored',
    });
    expect(policy.enabled).toBe(false);
    expect(policy.missingClassification).toBe('block');
    expect(policy.warnOnDowngrade).toBe(false);
    expect(policy.markSubject).toBe(true);
    expect(policy.allowedLevels).toEqual(['TLP:AMBER', 'TLP:RED']);
    expect(policy.defaultLevel).toBe('TLP:GREEN');
    expect(policy.allowUserDomains).toBe(false);
    expect(policy.domains).toEqual(['mail.example.gov']);
    expect(policy).not.toHaveProperty('unknownKey');
  });

  it('rejects an empty allowed-levels list and invalid enums', () => {
    expect(normalizeManagedPolicy({ allowedLevels: ['nope'] }).allowedLevels).toBeUndefined();
    expect(normalizeManagedPolicy({ missingClassification: 'explode' }).missingClassification).toBeUndefined();
  });
});

describe('applyManagedPolicy', () => {
  const user = normalizeSettings({
    missingClassification: 'off',
    domains: [{ host: 'user.example.com', enabled: true }],
    defaultLevel: null,
  });

  it('lets managed values override user values', () => {
    const effective = applyManagedPolicy(user, {
      missingClassification: 'block',
      warnOnDowngrade: false,
      enabled: false,
    });
    expect(effective.missingClassification).toBe('block');
    expect(effective.warnOnDowngrade).toBe(false);
    expect(effective.enabled).toBe(false);
  });

  it('merges managed domains as locked and enabled', () => {
    const effective = applyManagedPolicy(user, { domains: ['managed.example.gov'] });
    expect(effective.domains).toContainEqual({ host: 'user.example.com', enabled: true });
    expect(effective.domains).toContainEqual({ host: 'managed.example.gov', enabled: true, managed: true });
  });

  it('drops user domains when allowUserDomains is false', () => {
    const effective = applyManagedPolicy(user, {
      domains: ['managed.example.gov'],
      allowUserDomains: false,
    });
    expect(effective.domains).toEqual([{ host: 'managed.example.gov', enabled: true, managed: true }]);
    expect(effective.allowUserDomains).toBe(false);
  });

  it('restricts allowed levels and coerces default level into them', () => {
    const allowed = applyManagedPolicy(user, {
      allowedLevels: ['TLP:CLEAR', 'TLP:AMBER'],
      defaultLevel: 'TLP:RED',
    });
    expect(allowed.allowedLevels).toEqual(['TLP:CLEAR', 'TLP:AMBER']);
    // RED is not allowed, so the default is dropped.
    expect(allowed.defaultLevel).toBeNull();

    const allowedDefault = applyManagedPolicy(user, {
      allowedLevels: ['TLP:CLEAR', 'TLP:AMBER'],
      defaultLevel: 'TLP:AMBER',
    });
    expect(allowedDefault.defaultLevel).toBe('TLP:AMBER');
  });

  it('does not mutate the user settings object', () => {
    const before = JSON.stringify(user);
    applyManagedPolicy(user, { domains: ['managed.example.gov'], enabled: false });
    expect(JSON.stringify(user)).toBe(before);
  });

  it('exposes locked keys', () => {
    const locks = managedLockedKeys({ enabled: false, domains: ['x.example.com'] });
    expect(locks.has('enabled')).toBe(true);
    expect(locks.has('domains')).toBe(true);
    expect(locks.has('missingClassification')).toBe(false);
  });

  it('is a no-op for an empty policy', () => {
    expect(applyManagedPolicy(user, {})).toEqual(normalizeSettings(user));
    expect(applyManagedPolicy(user, {}).domains).toEqual(user.domains);
  });

  it('keeps managed domains ahead of a duplicated user host', () => {
    const effective = applyManagedPolicy(
      normalizeSettings({ domains: [{ host: 'mail.example.gov', enabled: false }] }),
      { domains: ['mail.example.gov'] },
    );
    expect(effective.domains).toEqual([{ host: 'mail.example.gov', enabled: true, managed: true }]);
  });
});

describe('settings defaults include policy fields', () => {
  it('allows every level by default with no default level', () => {
    expect(DEFAULT_SETTINGS.allowedLevels).toEqual([
      'TLP:CLEAR',
      'TLP:GREEN',
      'TLP:AMBER',
      'TLP:AMBER+STRICT',
      'TLP:RED',
    ]);
    expect(DEFAULT_SETTINGS.defaultLevel).toBeNull();
    expect(DEFAULT_SETTINGS.allowUserDomains).toBe(true);
  });
});
