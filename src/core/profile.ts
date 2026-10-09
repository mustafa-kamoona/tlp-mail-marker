import { normalizeSettings, type Settings } from './settings.js';
import { isTlpLevel } from './tlp.js';
import { managedLockedKeys, type ManagedPolicy } from './managed.js';

/** Portable presets contain configuration only, never hosts or mail data. */
export interface OrganisationProfile {
  format: 'tlp-mail-marker-profile';
  version: 1;
  name: string;
  settings: Pick<Settings, 'allowedLevels' | 'defaultLevel' | 'missingClassification'>;
}
export const PROFILE_MAX_BYTES = 16 * 1024;
const KEYS = ['allowedLevels', 'defaultLevel', 'missingClassification'] as const;

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== keys.length
      || !keys.every(key => Object.hasOwn(value, key))) {
    throw new Error('The profile has missing or unsupported fields.');
  }
  return value as Record<string, unknown>;
}

/** Unlike storage migrations, importing policy rejects every invalid value. */
export function parseProfile(text: string): OrganisationProfile {
  if (new TextEncoder().encode(text).length > PROFILE_MAX_BYTES) throw new Error('The profile must be smaller than 16 KB.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Choose a valid JSON profile.'); }
  const raw = object(value, ['format', 'version', 'name', 'settings']);
  if (raw.format !== 'tlp-mail-marker-profile' || raw.version !== 1) throw new Error('This profile format or version is not supported.');
  if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 100 || /[\u0000-\u001f\u007f]/.test(raw.name)) {
    throw new Error('Enter a profile name of 1–100 characters without control characters.');
  }
  const settings = object(raw.settings, KEYS);
  const levels = settings.allowedLevels;
  if (!Array.isArray(levels) || !levels.length || levels.length > 5
      || !levels.every(isTlpLevel) || new Set(levels).size !== levels.length) {
    throw new Error('Approved levels must be a non-empty list of unique TLP 2.0 labels.');
  }
  const defaultLevel = settings.defaultLevel;
  if (defaultLevel !== null && (!isTlpLevel(defaultLevel) || !levels.includes(defaultLevel))) {
    throw new Error('The default must be an approved level or null.');
  }
  const missing = settings.missingClassification;
  if (missing !== 'off' && missing !== 'warn' && missing !== 'block') throw new Error('The missing-classification rule must be off, warn or block.');
  return { format: raw.format, version: 1, name: raw.name.trim(), settings: {
    allowedLevels: [...levels], defaultLevel, missingClassification: missing,
  } };
}

export function exportProfile(settings: Settings, name: string): string {
  const text = JSON.stringify({ format: 'tlp-mail-marker-profile', version: 1, name,
    settings: Object.fromEntries(KEYS.map(key => [key, settings[key]])),
  }, null, 2);
  return `${JSON.stringify(parseProfile(text), null, 2)}\n`;
}

/** Managed values remain in policy; don't change their underlying user values. */
export function applyProfile(settings: Settings, profile: OrganisationProfile, policy: ManagedPolicy = {}): Settings {
  const validated = parseProfile(JSON.stringify(profile));
  const next = normalizeSettings(settings), locked = managedLockedKeys(policy);
  for (const key of KEYS) {
    if (!locked.has(key)) Object.assign(next, { [key]: validated.settings[key] });
  }
  return normalizeSettings(next);
}
