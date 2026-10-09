/**
 * MV3 background controller: Chromium service worker / Firefox event page.
 *
 * Kept intentionally small: it seeds default settings, keeps the dynamically
 * registered content script in sync with the user-authorised domains, and
 * nothing else. It performs no network access and stores no email data.
 */

import { DEFAULT_SETTINGS, SETTINGS_KEY, domainMatchPatterns } from '../core/settings.js';
import { isExtensionMessage } from '../utils/messaging.js';
import { logger } from '../utils/logger.js';
import { loadSettings, onSettingsChanged, watchStorageChanges } from '../utils/storage.js';

const CONTENT_SCRIPT_ID = 'tlp-mail-marker-content';
const ENV_SCRIPT_ID = 'tlp-mail-marker-env';
const CONTENT_SCRIPT_FILE = 'content.js';
const ENV_SCRIPT_FILE = 'env-probe.js';

async function ensureDefaults(): Promise<void> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  if (stored[SETTINGS_KEY] === undefined) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  }
}

/**
 * Register exactly the content-script matches that are both authorised by the
 * user's domain list and actually granted as host permissions.
 */
async function reconcile(): Promise<void> {
  try {
    const settings = await loadSettings();
    if (!settings.enabled) {
      await unregister();
      return;
    }

    const granted = new Set((await chrome.permissions.getAll()).origins ?? []);
    const matches = settings.domains
      .filter((rule) => rule.enabled)
      .flatMap((rule) => domainMatchPatterns(rule.host))
      .filter((pattern) => granted.has(pattern));

    if (matches.length === 0) {
      await unregister();
      return;
    }

    const uniqueMatches = [...new Set(matches)];
    const registrations: chrome.scripting.RegisteredContentScript[] = [
      {
        id: CONTENT_SCRIPT_ID,
        matches: uniqueMatches,
        js: [CONTENT_SCRIPT_FILE],
        allFrames: true,
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
      {
        id: ENV_SCRIPT_ID,
        matches: uniqueMatches,
        js: [ENV_SCRIPT_FILE],
        allFrames: true,
        runAt: 'document_idle',
        world: 'MAIN',
        persistAcrossSessions: true,
      },
    ];

    const existing = await chrome.scripting.getRegisteredContentScripts({
      ids: [CONTENT_SCRIPT_ID, ENV_SCRIPT_ID],
    });
    const existingIds = new Set(existing.map((script) => script.id));
    const toUpdate = registrations.filter((script) => existingIds.has(script.id));
    const toRegister = registrations.filter((script) => !existingIds.has(script.id));
    if (toUpdate.length > 0) {
      await chrome.scripting.updateContentScripts(toUpdate);
    }
    if (toRegister.length > 0) {
      await chrome.scripting.registerContentScripts(toRegister);
    }
    logger.debug('reconciled content scripts', uniqueMatches);
  } catch (error) {
    logger.error('failed to reconcile content scripts', error);
  }
}

async function unregister(): Promise<void> {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({
      ids: [CONTENT_SCRIPT_ID, ENV_SCRIPT_ID],
    });
    if (existing.length > 0) {
      await chrome.scripting.unregisterContentScripts({
        ids: existing.map((script) => script.id),
      });
    }
  } catch (error) {
    logger.debug('unregister skipped', error);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    await ensureDefaults();
    await reconcile();
    if (details.reason === 'install') {
      void chrome.runtime.openOptionsPage();
    }
  })();
});

chrome.runtime.onStartup.addListener(() => {
  void reconcile();
});

chrome.permissions.onAdded.addListener(() => {
  void reconcile();
});

chrome.permissions.onRemoved.addListener(() => {
  void reconcile();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isExtensionMessage(message)) {
    void reconcile().then(() => sendResponse({ ok: true }));
    return true; // async response
  }
  return false;
});

// Reconcile whenever user settings or managed policy change.
watchStorageChanges();
onSettingsChanged(() => {
  void reconcile();
});
