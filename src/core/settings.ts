/**
 * Settings model, defaults, validation and migration.
 *
 * Only non-sensitive configuration is stored. Email content, recipients,
 * attachments and credentials are never persisted.
 */

import { TLP_LEVELS, type TlpLevel, isTlpLevel } from './tlp.js';

export type MissingClassificationPolicy = 'off' | 'warn' | 'block';
export type ThemePreference = 'auto' | 'light' | 'dark';

export interface DomainRule {
  /**
   * Normalised host, optionally including a port, e.g. `mail.example.com` or
   * `localhost:8080`. Never includes a scheme, path, wildcard or credentials.
   */
  host: string;
  enabled: boolean;
  /** True when the host is enforced by enterprise policy and cannot be edited. */
  managed?: boolean;
}

export interface Settings {
  /** Master switch. */
  enabled: boolean;
  /** User-authorised webmail origins (managed origins are merged in). */
  domains: DomainRule[];
  /** What to do when sending without a classification. */
  missingClassification: MissingClassificationPolicy;
  /** Warn (not block) when the audience appears to be widened. */
  warnOnDowngrade: boolean;
  /** Prefix the subject with `[TLP:LEVEL]`. */
  markSubject: boolean;
  /** Add a TLP marker at the top of the message body. */
  markBody: boolean;
  /** Use official TLP colours (text label is always present regardless). */
  colorCoding: boolean;
  theme: ThemePreference;
  /** TLP levels the user (or administrator) permits in the selector. */
  allowedLevels: TlpLevel[];
  /** Level preselected for a brand-new message, if any. */
  defaultLevel: TlpLevel | null;
  /** Whether the user may add their own domains (false under strict policy). */
  allowUserDomains: boolean;
  /** Schema version, used for migrations. */
  version: number;
}

export const SETTINGS_VERSION = 1;
export const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  domains: [],
  missingClassification: 'warn',
  warnOnDowngrade: true,
  markSubject: true,
  markBody: true,
  colorCoding: true,
  theme: 'auto',
  allowedLevels: [...TLP_LEVELS],
  defaultLevel: null,
  allowUserDomains: true,
  version: SETTINGS_VERSION,
};

const HOST_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function isValidHostname(host: string): boolean {
  if (host === 'localhost') {
    return true;
  }
  if (host.length > 253) {
    return false;
  }
  // IPv4
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return host.split('.').every((part) => {
      const n = Number(part);
      return n >= 0 && n <= 255 && String(n) === part.replace(/^0+(?=\d)/, '');
    });
  }
  const labels = host.split('.');
  if (labels.length < 2) {
    return false;
  }
  return labels.every((label) => HOST_LABEL_RE.test(label));
}

/**
 * Normalise free-form user input (a URL or host) into a safe host[:port].
 * Returns null when the input cannot be used or is too broad.
 */
export function normalizeDomain(input: string): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  let value = input.trim().toLowerCase();
  if (!value) {
    return null;
  }
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // strip scheme
  value = value.replace(/^[^@/?#]*@/, ''); // strip credentials
  if (value.includes('*')) {
    return null; // wildcards are never accepted
  }
  value = value.split(/[/?#]/, 1)[0] ?? ''; // strip path/query/hash
  if (!value) {
    return null;
  }
  const portMatch = /:(\d{1,5})$/.exec(value);
  const port = portMatch ? Number(portMatch[1]) : null;
  const host = portMatch ? value.slice(0, -portMatch[0].length) : value;
  if (!host || !isValidHostname(host)) {
    return null;
  }
  if (port != null && (port < 1 || port > 65535)) {
    return null;
  }
  return port != null ? `${host}:${port}` : host;
}

/** Strip a port for use in a Chrome match pattern (ports are not part of patterns). */
export function hostForMatchPattern(host: string): string {
  return host.replace(/:\d+$/, '');
}

/**
 * Chrome match patterns for a host. Both schemes are produced because Chrome
 * match patterns cannot express "either scheme", and the optional host
 * permission is requested per pattern.
 */
export function domainMatchPatterns(host: string): string[] {
  const h = hostForMatchPattern(host);
  return [`https://${h}/*`, `http://${h}/*`];
}

function coerceDomainRules(value: unknown): DomainRule[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: DomainRule[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    let host: string | null = null;
    let enabled = true;
    let managed = false;
    if (typeof entry === 'string') {
      host = normalizeDomain(entry);
    } else if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      host = typeof obj.host === 'string' ? normalizeDomain(obj.host) : null;
      if (typeof obj.enabled === 'boolean') {
        enabled = obj.enabled;
      }
      managed = obj.managed === true;
    }
    if (host && !seen.has(host)) {
      seen.add(host);
      out.push(managed ? { host, enabled: true, managed: true } : { host, enabled });
    }
  }
  return out;
}

function coerceLevels(value: unknown): TlpLevel[] {
  if (!Array.isArray(value)) {
    return [...TLP_LEVELS];
  }
  const levels: TlpLevel[] = [];
  for (const entry of value) {
    if (isTlpLevel(entry) && !levels.includes(entry)) {
      levels.push(entry);
    }
  }
  return levels.length > 0 ? levels : [...TLP_LEVELS];
}

function coerceDefaultLevel(value: unknown, allowedLevels: TlpLevel[]): TlpLevel | null {
  return isTlpLevel(value) && allowedLevels.includes(value) ? value : null;
}

function coercePolicy(value: unknown): MissingClassificationPolicy {
  return value === 'off' || value === 'block' || value === 'warn' ? value : DEFAULT_SETTINGS.missingClassification;
}

function coerceTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'auto' ? value : DEFAULT_SETTINGS.theme;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Merge untrusted stored data with defaults, discarding anything invalid. */
export function normalizeSettings(input: unknown): Settings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const allowedLevels = coerceLevels(raw.allowedLevels);
  return {
    enabled: coerceBoolean(raw.enabled, DEFAULT_SETTINGS.enabled),
    domains: coerceDomainRules(raw.domains),
    missingClassification: coercePolicy(raw.missingClassification),
    warnOnDowngrade: coerceBoolean(raw.warnOnDowngrade, DEFAULT_SETTINGS.warnOnDowngrade),
    markSubject: coerceBoolean(raw.markSubject, DEFAULT_SETTINGS.markSubject),
    markBody: coerceBoolean(raw.markBody, DEFAULT_SETTINGS.markBody),
    colorCoding: coerceBoolean(raw.colorCoding, DEFAULT_SETTINGS.colorCoding),
    theme: coerceTheme(raw.theme),
    allowedLevels,
    defaultLevel: coerceDefaultLevel(raw.defaultLevel, allowedLevels),
    allowUserDomains: coerceBoolean(raw.allowUserDomains, DEFAULT_SETTINGS.allowUserDomains),
    version: SETTINGS_VERSION,
  };
}

export interface EffectiveDomainConfig {
  enabled: boolean;
  matchedHost: string | null;
}

/**
 * Decide whether the extension should act on a given URL, according to the
 * master switch and the authorised domain list.
 */
export function evaluateDomain(settings: Settings, url: string): EffectiveDomainConfig {
  if (!settings.enabled) {
    return { enabled: false, matchedHost: null };
  }
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { enabled: false, matchedHost: null };
    }
    host = parsed.hostname.toLowerCase();
  } catch {
    return { enabled: false, matchedHost: null };
  }
  for (const rule of settings.domains) {
    if (rule.enabled && hostForMatchPattern(rule.host) === host) {
      return { enabled: true, matchedHost: rule.host };
    }
  }
  return { enabled: false, matchedHost: null };
}
