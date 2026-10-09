/**
 * Enterprise managed policy (`chrome.storage.managed`).
 *
 * Administrators can preconfigure the extension through the browser's policy
 * mechanism. Policy values override user settings for the keys they define and
 * are surfaced to the options UI as locked. Nothing here reads or stores email
 * content; it is configuration only.
 */

import {
  type MissingClassificationPolicy,
  type Settings,
  normalizeSettings,
} from './settings.js';
import { type TlpLevel, TLP_LEVELS, isTlpLevel } from './tlp.js';
import { normalizeDomain, type DomainRule } from './settings.js';

/** Raw policy object as exposed by `chrome.storage.managed`. */
export interface ManagedPolicy {
  enabled?: boolean;
  domains?: string[];
  missingClassification?: MissingClassificationPolicy;
  warnOnDowngrade?: boolean;
  markSubject?: boolean;
  markBody?: boolean;
  colorCoding?: boolean;
  allowedLevels?: TlpLevel[];
  defaultLevel?: TlpLevel;
  allowUserDomains?: boolean;
}

export type ManagedKey = keyof ManagedPolicy;

const BOOLEAN_KEYS: Array<Extract<ManagedKey, 'enabled' | 'warnOnDowngrade' | 'markSubject' | 'markBody' | 'colorCoding' | 'allowUserDomains'>> = [
  'enabled',
  'warnOnDowngrade',
  'markSubject',
  'markBody',
  'colorCoding',
  'allowUserDomains',
];

function coerceBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function coercePolicy(value: unknown): MissingClassificationPolicy | undefined {
  return value === 'off' || value === 'warn' || value === 'block' ? value : undefined;
}

function coerceDomains(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const hosts: string[] = [];
  for (const entry of value) {
    const host = typeof entry === 'string' ? normalizeDomain(entry) : null;
    if (host && !hosts.includes(host)) {
      hosts.push(host);
    }
  }
  return hosts;
}

function coerceLevels(value: unknown): TlpLevel[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const levels: TlpLevel[] = [];
  for (const entry of value) {
    if (isTlpLevel(entry) && !levels.includes(entry)) {
      levels.push(entry);
    }
  }
  return levels.length > 0 ? levels : undefined;
}

/** Validate and normalise an untrusted managed-policy object. */
export function normalizeManagedPolicy(input: unknown): ManagedPolicy {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const policy: ManagedPolicy = {};

  for (const key of BOOLEAN_KEYS) {
    const value = coerceBoolean(raw[key]);
    if (value !== undefined) {
      policy[key] = value;
    }
  }
  const missing = coercePolicy(raw.missingClassification);
  if (missing !== undefined) {
    policy.missingClassification = missing;
  }
  const domains = coerceDomains(raw.domains);
  if (domains !== undefined) {
    policy.domains = domains;
  }
  const allowedLevels = coerceLevels(raw.allowedLevels);
  if (allowedLevels !== undefined) {
    policy.allowedLevels = allowedLevels;
  }
  const defaultLevel = isTlpLevel(raw.defaultLevel) ? raw.defaultLevel : undefined;
  if (defaultLevel !== undefined) {
    policy.defaultLevel = defaultLevel;
  }
  return policy;
}

export function hasManagedPolicy(policy: ManagedPolicy): boolean {
  return Object.keys(policy).length > 0;
}

/** Keys that the administrator controls (used to lock the options UI). */
export function managedLockedKeys(policy: ManagedPolicy): Set<ManagedKey> {
  return new Set(Object.keys(policy) as ManagedKey[]);
}

function managedDomainRules(hosts: string[] | undefined): DomainRule[] {
  return (hosts ?? []).map((host) => ({ host, enabled: true, managed: true }));
}

function mergeDomainRules(managed: DomainRule[], user: DomainRule[]): DomainRule[] {
  const out: DomainRule[] = [];
  const seen = new Set<string>();
  for (const rule of [...managed, ...user]) {
    if (seen.has(rule.host)) {
      continue;
    }
    seen.add(rule.host);
    out.push(rule);
  }
  return out;
}

/**
 * Produce the effective settings by layering the managed policy over the user's
 * settings. Managed values win; managed domains are merged in and marked.
 */
export function applyManagedPolicy(userSettings: Settings, policy: ManagedPolicy): Settings {
  const base = normalizeSettings(userSettings);

  const allowedLevels = policy.allowedLevels ?? base.allowedLevels;
  let defaultLevel: TlpLevel | null = null;
  const candidateDefault = policy.defaultLevel ?? base.defaultLevel;
  if (candidateDefault && allowedLevels.includes(candidateDefault)) {
    defaultLevel = candidateDefault;
  }

  const userDomains =
    policy.allowUserDomains === false ? [] : base.domains.filter((rule) => !rule.managed);
  const domains = mergeDomainRules(managedDomainRules(policy.domains), userDomains);

  return {
    ...base,
    enabled: policy.enabled ?? base.enabled,
    missingClassification: policy.missingClassification ?? base.missingClassification,
    warnOnDowngrade: policy.warnOnDowngrade ?? base.warnOnDowngrade,
    markSubject: policy.markSubject ?? base.markSubject,
    markBody: policy.markBody ?? base.markBody,
    colorCoding: policy.colorCoding ?? base.colorCoding,
    allowedLevels,
    defaultLevel,
    allowUserDomains: policy.allowUserDomains ?? base.allowUserDomains,
    domains,
  };
}

/** Convenience for tests / callers that only have raw values. */
export const ALL_TLP_LEVELS: readonly TlpLevel[] = TLP_LEVELS;
