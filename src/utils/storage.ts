/**
 * Settings persistence on top of `chrome.storage.local`, layered with
 * enterprise policy from `chrome.storage.managed`.
 *
 * `chrome.storage.sync` is deliberately NOT used: sync would transmit settings
 * through a third-party service. All configuration stays in the local browser
 * profile; managed policy is supplied by the browser, not the network.
 */

import { applyManagedPolicy, type ManagedPolicy, normalizeManagedPolicy } from '../core/managed.js';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  type Settings,
  normalizeSettings,
} from '../core/settings.js';

type Listener = (settings: Settings) => void;

let userSettings: Settings | null = null;
let managedPolicy: ManagedPolicy = {};
let effectiveSettings: Settings | null = null;
const listeners = new Set<Listener>();

async function readUserSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    return normalizeSettings(stored[SETTINGS_KEY]);
  } catch {
    return normalizeSettings(undefined);
  }
}

async function readManagedPolicy(): Promise<ManagedPolicy> {
  try {
    const raw = await chrome.storage.managed.get(null);
    return normalizeManagedPolicy(raw);
  } catch {
    // Managed storage is unavailable outside a managed profile.
    return {};
  }
}

function stripManaged(settings: Settings): Settings {
  const normalized = normalizeSettings(settings);
  return {
    ...normalized,
    domains: normalized.domains
      .filter((rule) => !rule.managed)
      .map((rule) => ({ host: rule.host, enabled: rule.enabled })),
  };
}

function computeEffective(): Settings {
  effectiveSettings = applyManagedPolicy(userSettings ?? DEFAULT_SETTINGS, managedPolicy);
  return effectiveSettings;
}

function notify(): void {
  const settings = computeEffective();
  listeners.forEach((listener) => listener(settings));
}

/** Load user settings and managed policy, and return the effective settings. */
export async function loadSettings(): Promise<Settings> {
  userSettings = await readUserSettings();
  managedPolicy = await readManagedPolicy();
  return computeEffective();
}

/** Load only the user's own settings (for the options UI). */
export async function loadUserSettings(): Promise<Settings> {
  userSettings = await readUserSettings();
  return userSettings;
}

/**
 * Persist user settings. Managed keys are not stored here; they are always
 * taken from policy at read time, so they cannot be overridden.
 */
export async function saveSettings(next: Settings): Promise<Settings> {
  userSettings = stripManaged(next);
  await chrome.storage.local.set({ [SETTINGS_KEY]: userSettings });
  notify();
  return effectiveSettings ?? computeEffective();
}

export function getCachedSettings(): Settings {
  return effectiveSettings ?? computeEffective();
}

export function getUserSettings(): Settings {
  return userSettings ?? normalizeSettings(undefined);
}

export function getManagedPolicy(): ManagedPolicy {
  return managedPolicy;
}

export function onSettingsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribe to changes made by other contexts and to managed-policy changes. */
export function watchStorageChanges(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SETTINGS_KEY]) {
      userSettings = normalizeSettings(changes[SETTINGS_KEY].newValue);
      notify();
    } else if (area === 'managed') {
      void readManagedPolicy().then((policy) => {
        managedPolicy = policy;
        notify();
      });
    }
  });
}
