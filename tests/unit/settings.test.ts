import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  domainMatchPatterns,
  evaluateDomain,
  hostForMatchPattern,
  normalizeDomain,
  normalizeSettings,
} from '../../src/core/settings.js';

describe('normalizeDomain', () => {
  it('accepts hostnames and URLs', () => {
    expect(normalizeDomain('https://mail.example.com/inbox?x=1')).toBe('mail.example.com');
    expect(normalizeDomain('MAIL.Example.GOV')).toBe('mail.example.gov');
    expect(normalizeDomain('mail.example.com:8443')).toBe('mail.example.com:8443');
    expect(normalizeDomain('user:pass@mail.example.com')).toBe('mail.example.com');
    expect(normalizeDomain('localhost:8080')).toBe('localhost:8080');
    expect(normalizeDomain('http://127.0.0.1:8000/webmail')).toBe('127.0.0.1:8000');
  });

  it('rejects broad, malformed or unsafe input', () => {
    expect(normalizeDomain('*')).toBeNull();
    expect(normalizeDomain('*://*/*')).toBeNull();
    expect(normalizeDomain('mail.example.com/*')).toBeNull();
    expect(normalizeDomain('mail')).toBeNull();
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('  ')).toBeNull();
    expect(normalizeDomain('mail.example.com:99999')).toBeNull();
    expect(normalizeDomain('http://exa mple.com')).toBeNull();
  });

  it('builds match patterns without ports', () => {
    expect(hostForMatchPattern('mail.example.com:8443')).toBe('mail.example.com');
    expect(domainMatchPatterns('mail.example.com:8443')).toEqual([
      'https://mail.example.com/*',
      'http://mail.example.com/*',
    ]);
  });
});

describe('normalizeSettings', () => {
  it('returns defaults for empty or invalid input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and discards invalid ones', () => {
    const settings = normalizeSettings({
      enabled: false,
      missingClassification: 'block',
      warnOnDowngrade: false,
      markSubject: false,
      markBody: false,
      colorCoding: false,
      theme: 'dark',
      domains: ['mail.example.com', { host: 'ctx.example.org', enabled: false }, 'not a host', 42],
    });
    expect(settings.enabled).toBe(false);
    expect(settings.missingClassification).toBe('block');
    expect(settings.warnOnDowngrade).toBe(false);
    expect(settings.markSubject).toBe(false);
    expect(settings.markBody).toBe(false);
    expect(settings.colorCoding).toBe(false);
    expect(settings.theme).toBe('dark');
    expect(settings.domains).toEqual([
      { host: 'mail.example.com', enabled: true },
      { host: 'ctx.example.org', enabled: false },
    ]);
    expect(settings.version).toBe(DEFAULT_SETTINGS.version);
  });

  it('falls back on invalid enum values', () => {
    const settings = normalizeSettings({ missingClassification: 'explode', theme: 'neon' });
    expect(settings.missingClassification).toBe(DEFAULT_SETTINGS.missingClassification);
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('deduplicates domains', () => {
    const settings = normalizeSettings({ domains: ['mail.example.com', 'mail.example.com'] });
    expect(settings.domains).toHaveLength(1);
  });

  it('never fabricates keys for email content', () => {
    const settings = normalizeSettings({ body: 'secret', recipients: ['a@b.c'] }) as unknown as Record<string, unknown>;
    expect(settings).not.toHaveProperty('body');
    expect(settings).not.toHaveProperty('recipients');
  });
});

describe('evaluateDomain', () => {
  const settings = normalizeSettings({ domains: [{ host: 'mail.example.com', enabled: true }] });

  it('enables authorised origins', () => {
    expect(evaluateDomain(settings, 'https://mail.example.com/?_task=mail')).toEqual({
      enabled: true,
      matchedHost: 'mail.example.com',
    });
  });

  it('disables unauthorised or non-http origins', () => {
    expect(evaluateDomain(settings, 'https://other.example.com/').enabled).toBe(false);
    expect(evaluateDomain(settings, 'ftp://mail.example.com/').enabled).toBe(false);
    expect(evaluateDomain(settings, 'not a url').enabled).toBe(false);
  });

  it('respects the master switch', () => {
    expect(evaluateDomain(normalizeSettings({ ...settings, enabled: false }), 'https://mail.example.com/').enabled).toBe(false);
  });

  it('matches a port-qualified rule against the hostname', () => {
    const withPort = normalizeSettings({ domains: [{ host: 'localhost:8080', enabled: true }] });
    expect(evaluateDomain(withPort, 'http://localhost:8080/?_task=mail').enabled).toBe(true);
  });
});
