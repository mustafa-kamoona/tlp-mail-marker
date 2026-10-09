/** Options page controller. Plain DOM, no framework, no external requests. */

import { hasManagedPolicy, managedLockedKeys, type ManagedKey, type ManagedPolicy } from '../core/managed.js';
import {
  domainMatchPatterns,
  normalizeDomain,
  type MissingClassificationPolicy,
  type Settings,
  type ThemePreference,
} from '../core/settings.js';
import { notifyReconcile } from '../utils/messaging.js';
import { bindProfileControls } from './profile-ui.js';
import { readLevelSettings, renderLevelSettings } from './level-settings.js';
import { localizeDocument, t } from '../utils/i18n.js';
import {
  getManagedPolicy,
  getUserSettings,
  loadSettings,
  saveSettings,
} from '../utils/storage.js';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing element #${id}`);
  }
  return el as T;
}

const elements = {
  banner: byId<HTMLDivElement>('managed-banner'),
  enabled: byId<HTMLInputElement>('enabled'),
  missing: byId<HTMLSelectElement>('missing'),
  warnDowngrade: byId<HTMLInputElement>('warn-downgrade'),
  markSubject: byId<HTMLInputElement>('mark-subject'),
  markBody: byId<HTMLInputElement>('mark-body'),
  colorCoding: byId<HTMLInputElement>('color-coding'),
  theme: byId<HTMLSelectElement>('theme'),
  domainList: byId<HTMLUListElement>('domain-list'),
  domainInput: byId<HTMLInputElement>('domain-input'),
  domainAdd: byId<HTMLButtonElement>('domain-add'),
  domainStatus: byId<HTMLParagraphElement>('domain-status'),
  version: byId<HTMLSpanElement>('version'),
};

let user: Settings;
let effective: Settings;
let policy: ManagedPolicy;
let locked: Set<ManagedKey>;

function setStatus(message: string, tone?: 'ok' | 'error'): void {
  elements.domainStatus.textContent = message;
  if (tone) {
    elements.domainStatus.setAttribute('data-tone', tone);
  } else {
    elements.domainStatus.removeAttribute('data-tone');
  }
}

/** Disable a control and annotate it when the value is enforced by policy. */
function applyLock(control: HTMLElement, key: ManagedKey): boolean {
  const isLocked = locked.has(key);
  (control as HTMLInputElement | HTMLSelectElement).disabled = isLocked;
  const container = control.closest('.row, .field');
  if (container) {
    container.classList.toggle('is-locked', isLocked);
    let hint = container.querySelector('.locked-hint');
    if (isLocked) {
      if (!hint) {
        hint = document.createElement('span');
        hint.className = 'locked-hint';
        hint.textContent = t('optManagedTag');
        control.insertAdjacentElement('afterend', hint);
      }
    } else if (hint) {
      hint.remove();
    }
  }
  return isLocked;
}

function renderForm(): void {
  elements.enabled.checked = effective.enabled;
  elements.missing.value = effective.missingClassification;
  elements.warnDowngrade.checked = effective.warnOnDowngrade;
  elements.markSubject.checked = effective.markSubject;
  elements.markBody.checked = effective.markBody;
  elements.colorCoding.checked = effective.colorCoding;
  elements.theme.value = effective.theme;
  renderLevelSettings(document, effective, locked);

  applyLock(elements.enabled, 'enabled');
  applyLock(elements.missing, 'missingClassification');
  applyLock(elements.warnDowngrade, 'warnOnDowngrade');
  applyLock(elements.markSubject, 'markSubject');
  applyLock(elements.markBody, 'markBody');
  applyLock(elements.colorCoding, 'colorCoding');

  elements.banner.hidden = !hasManagedPolicy(policy);
}

function renderDomains(): void {
  elements.domainList.textContent = '';
  const canAddUserDomains = effective.allowUserDomains && !locked.has('domains');
  elements.domainInput.disabled = !canAddUserDomains;
  elements.domainAdd.disabled = !canAddUserDomains;

  if (effective.domains.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'domain-empty';
    empty.textContent = t('optNoDomains');
    elements.domainList.appendChild(empty);
    return;
  }

  for (const rule of effective.domains) {
    const li = document.createElement('li');
    if (rule.managed) {
      li.classList.add('managed');
    }

    const host = document.createElement('span');
    host.className = 'domain-host';
    host.textContent = rule.host;

    if (rule.managed) {
      const badge = document.createElement('span');
      badge.className = 'locked-hint';
      badge.textContent = t('optManagedTag');
      li.append(host, badge);
      elements.domainList.appendChild(li);
      continue;
    }

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = rule.enabled;
    toggle.setAttribute('aria-label', t('optEnableHost', { host: rule.host }));
    toggle.addEventListener('change', () => {
      const target = user.domains.find((entry) => entry.host === rule.host);
      if (target) {
        target.enabled = toggle.checked;
        void persist('toggle-domain');
      }
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-danger';
    remove.textContent = t('optRemove');
    remove.addEventListener('click', () => {
      void removeDomain(rule.host);
    });

    li.append(toggle, host, remove);
    elements.domainList.appendChild(li);
  }
}

async function persist(reason: string): Promise<void> {
  effective = await saveSettings(user);
  user = getUserSettings();
  locked = managedLockedKeys(policy);
  notifyReconcile(reason);
  renderForm();
  renderDomains();
}

async function addDomain(): Promise<void> {
  if (!effective.allowUserDomains || locked.has('domains')) {
    setStatus(t('optStatusManaged'), 'error');
    return;
  }
  const host = normalizeDomain(elements.domainInput.value);
  if (!host) {
    setStatus(t('optStatusInvalidDomain'), 'error');
    return;
  }
  if (effective.domains.some((rule) => rule.host === host)) {
    setStatus(t('optStatusAlready', { host }), 'error');
    return;
  }
  const origins = domainMatchPatterns(host);
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins });
  } catch {
    granted = false;
  }
  if (!granted) {
    setStatus(t('optStatusDenied'), 'error');
    return;
  }
  user.domains.push({ host, enabled: true });
  elements.domainInput.value = '';
  await persist('add-domain');
  setStatus(t('optStatusAdded', { host }), 'ok');
}

async function removeDomain(host: string): Promise<void> {
  try {
    await chrome.permissions.remove({ origins: domainMatchPatterns(host) });
  } catch {
    // Permission may already be gone; continue removing the rule.
  }
  user.domains = user.domains.filter((rule) => rule.host !== host);
  await persist('remove-domain');
  setStatus(t('optStatusRemoved', { host }));
}

function bindForm(): void {
  const levelsChanged = () => {
    try {
      const next = readLevelSettings(document);
      if (!locked.has('allowedLevels')) user.allowedLevels = next.allowedLevels;
      if (!locked.has('defaultLevel')) user.defaultLevel = next.defaultLevel;
      void persist('classification-levels');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), 'error');
      renderForm();
    }
  };
  document.getElementById('allowed-levels')!.addEventListener('change', levelsChanged);
  document.getElementById('default-level')!.addEventListener('change', levelsChanged);
  elements.enabled.addEventListener('change', () => {
    user.enabled = elements.enabled.checked;
    void persist('enabled');
  });
  elements.missing.addEventListener('change', () => {
    user.missingClassification = elements.missing.value as MissingClassificationPolicy;
    void persist('missing-policy');
  });
  elements.warnDowngrade.addEventListener('change', () => {
    user.warnOnDowngrade = elements.warnDowngrade.checked;
    void persist('warn-downgrade');
  });
  elements.markSubject.addEventListener('change', () => {
    user.markSubject = elements.markSubject.checked;
    void persist('mark-subject');
  });
  elements.markBody.addEventListener('change', () => {
    user.markBody = elements.markBody.checked;
    void persist('mark-body');
  });
  elements.colorCoding.addEventListener('change', () => {
    user.colorCoding = elements.colorCoding.checked;
    void persist('color-coding');
  });
  elements.theme.addEventListener('change', () => {
    user.theme = elements.theme.value as ThemePreference;
    void persist('theme');
  });
  elements.domainAdd.addEventListener('click', () => {
    void addDomain();
  });
  elements.domainInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void addDomain();
    }
  });
}

async function main(): Promise<void> {
  localizeDocument(document);
  effective = await loadSettings();
  user = getUserSettings();
  policy = getManagedPolicy();
  locked = managedLockedKeys(policy);

  renderForm();
  renderDomains();
  bindForm();
  bindProfileControls(document, {
    async read() {
      effective = await loadSettings(); user = getUserSettings(); policy = getManagedPolicy(); locked = managedLockedKeys(policy);
      return { user, policy };
    },
    async save(settings) { user = settings; await persist('organisation-profile'); },
  });
  elements.version.textContent = t('optVersion', { version: chrome.runtime.getManifest().version });
}

void main();
