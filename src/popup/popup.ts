/** Action popup: quick status and per-site authorisation. */

import { managedLockedKeys, normalizeManagedPolicy } from '../core/managed.js';
import {
  domainMatchPatterns,
  hostForMatchPattern,
  normalizeDomain,
  type Settings,
} from '../core/settings.js';
import { TLP_LEVELS_FOR_UI } from './popup-model.js';
import { notifyReconcile } from '../utils/messaging.js';
import { localizeDocument, t, tlpDescription, tlpSummary } from '../utils/i18n.js';
import { getManagedPolicy, getUserSettings, loadSettings, saveSettings } from '../utils/storage.js';

const statusEl = document.getElementById('status') as HTMLParagraphElement;
const toggleBtn = document.getElementById('toggle-site') as HTMLButtonElement;
const optionsBtn = document.getElementById('open-options') as HTMLButtonElement;
const legendList = document.getElementById('legend-list') as HTMLUListElement;

function setStatus(message: string, tone?: 'ok' | 'error'): void {
  statusEl.textContent = message;
  if (tone) {
    statusEl.setAttribute('data-tone', tone);
  } else {
    statusEl.removeAttribute('data-tone');
  }
}

function renderLegend(): void {
  for (const def of TLP_LEVELS_FOR_UI) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.setAttribute('data-level', def.level);
    dot.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = def.name;
    const desc = document.createElement('span');
    desc.className = 'desc';
    desc.textContent = tlpSummary(def.level);
    li.title = tlpDescription(def.level);
    li.append(dot, name, desc);
    legendList.appendChild(li);
  }
}

async function currentHost(): Promise<string | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      return null;
    }
    const parsed = new URL(tab.url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return normalizeDomain(parsed.host);
  } catch {
    return null;
  }
}

function findRule(settings: Settings, host: string) {
  const hostname = hostForMatchPattern(host);
  return settings.domains.find((rule) => hostForMatchPattern(rule.host) === hostname) ?? null;
}

async function authorize(host: string): Promise<void> {
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: domainMatchPatterns(host) });
  } catch {
    granted = false;
  }
  if (!granted) {
    setStatus(t('popupPermissionDenied'), 'error');
    return;
  }
  const user = getUserSettings();
  if (!user.domains.some((rule) => rule.host === host)) {
    user.domains.push({ host, enabled: true });
  } else {
    user.domains = user.domains.map((rule) => (rule.host === host ? { ...rule, enabled: true } : rule));
  }
  await saveSettings(user);
  notifyReconcile('popup-authorize');
  await refresh();
}

async function revoke(host: string): Promise<void> {
  try {
    await chrome.permissions.remove({ origins: domainMatchPatterns(host) });
  } catch {
    // ignore
  }
  const user = getUserSettings();
  user.domains = user.domains.filter((rule) => rule.host !== host);
  await saveSettings(user);
  notifyReconcile('popup-revoke');
  await refresh();
}

async function refresh(): Promise<void> {
  const settings = await loadSettings();
  const policy = normalizeManagedPolicy(getManagedPolicy());
  const lockedDomains = managedLockedKeys(policy).has('domains');

  const host = await currentHost();
  if (!host) {
    setStatus(t('popupNotWebPage'));
    toggleBtn.hidden = true;
    return;
  }
  const rule = findRule(settings, host);
  if (rule) {
    toggleBtn.hidden = false;
    if (rule.managed) {
      setStatus(t('popupActiveManaged', { host }), 'ok');
      toggleBtn.hidden = true;
      return;
    }
    setStatus(t('popupActive', { host }), 'ok');
    toggleBtn.textContent = t('popupRemoveAccess');
    toggleBtn.onclick = () => {
      void revoke(rule.host);
    };
    return;
  }

  if (!settings.allowUserDomains || lockedDomains) {
    setStatus(t('popupNotAuthorisedManaged', { host }), 'error');
    toggleBtn.hidden = true;
    return;
  }
  setStatus(t('popupNotAuthorised', { host }), 'error');
  toggleBtn.hidden = false;
  toggleBtn.textContent = t('popupAuthorise');
  toggleBtn.onclick = () => {
    void authorize(host);
  };
}

optionsBtn.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

localizeDocument(document);
renderLegend();
void refresh();
