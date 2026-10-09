import { mailApi } from './api.js';
import { SETTINGS_KEY } from '../core/settings.js';
import { thunderbirdSettings } from './model.js';
import { status } from './ui.js';
import { bindProfileControls } from '../options/profile-ui.js';
import { readLevelSettings, renderLevelSettings } from '../options/level-settings.js';
const api = mailApi();
const flags = ['enabled', 'warnOnDowngrade', 'markSubject', 'markBody', 'colorCoding'] as const;
const permission = document.getElementById('source-permission') as HTMLButtonElement;
async function permissionState() {
  const allowed = await api.permissions.contains({ permissions: ['messagesRead'] });
  permission.textContent = allowed ? 'Remove original-message access' : 'Allow original-message access';
  permission.dataset.allowed = String(allowed);
  document.getElementById('source-status')!.textContent = allowed ? 'Original-message access is enabled.' : 'Original-message access is not enabled.';
}
document.getElementById('settings')!.addEventListener('submit', event => {
  event.preventDefault();
  void (async () => {
    const settings = thunderbirdSettings((await api.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
    for (const key of flags) settings[key] = (document.getElementById(key) as HTMLInputElement).checked;
    const raw = { ...settings,
      missingClassification: (document.getElementById('missingClassification') as HTMLSelectElement).value,
      ...readLevelSettings(document),
    };
    await api.storage.local.set({ [SETTINGS_KEY]: thunderbirdSettings(raw) });
    await render();
    status('Settings saved.');
  })().catch(error => status(error.message));
});
permission.addEventListener('click', () => {
  // Permission requests must start directly from this user gesture.
  const operation = permission.dataset.allowed === 'true'
    ? api.permissions.remove({ permissions: ['messagesRead'] })
    : api.permissions.request({ permissions: ['messagesRead'] });
  void operation.then(permissionState).catch(error => status(error.message));
});
async function render() {
  const settings = thunderbirdSettings((await api.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
  for (const key of flags) (document.getElementById(key) as HTMLInputElement).checked = settings[key];
  (document.getElementById('missingClassification') as HTMLSelectElement).value = settings.missingClassification;
  renderLevelSettings(document, settings);
}
bindProfileControls(document, {
  async read() { return { user: thunderbirdSettings((await api.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]), policy: {} }; },
  async save(settings) { await api.storage.local.set({ [SETTINGS_KEY]: thunderbirdSettings(settings) }); await render(); },
});
void (async () => {
  await render();
  await permissionState();
})().catch(error => status(error.message));
