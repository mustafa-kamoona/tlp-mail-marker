import { mailApi } from './api.js';
import { isTlpLevel, type TlpLevel } from '../core/tlp.js';
import { localizeDocument, tlpDescription } from '../utils/i18n.js';
import { showIssues, status } from './ui.js';

const api = mailApi();
let tabId: number;
let pending: TlpLevel | null = null;
const levels = document.getElementById('levels')!;
const confirmation = document.getElementById('confirmation')!;
localizeDocument(document);
async function refresh() {
  const state = await api.runtime.sendMessage({ action: 'state', tabId });
  if (state?.error) throw new Error(state.error);
  levels.replaceChildren();
  const legend = document.createElement('legend'); legend.textContent = 'Sharing boundary'; levels.appendChild(legend);
  for (const level of [null, ...state.levels] as Array<TlpLevel | null>) {
    const label = document.createElement('label'); label.className = 'level';
    const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'level'; radio.value = level ?? ''; radio.checked = level === state.selected;
    label.append(radio, document.createTextNode(level ?? 'No classification'));
    if (level) {
      const dot = document.createElement('span'); dot.className = 'dot'; dot.dataset.level = level; label.appendChild(dot);
    }
    levels.appendChild(label);
  }
  (document.getElementById('apply') as HTMLButtonElement).disabled = !state.enabled;
  showIssues(document.getElementById('issues')!, state.issues);
  status(!state.enabled ? 'Disabled in Settings.' : state.original ? `Original classification: ${state.original}.` : '');
  describe();
}
function chosen(): TlpLevel | null {
  const value = (document.querySelector('input[name="level"]:checked') as HTMLInputElement | null)?.value;
  return isTlpLevel(value) ? value : null;
}
function describe() {
  const level = chosen();
  document.getElementById('description')!.textContent = level ? tlpDescription(level) : 'Remove the selected subject and body markings.';
}
async function apply(confirmed: boolean) {
  const response = await api.runtime.sendMessage({ action: 'apply', tabId, level: pending, confirmed });
  if (response?.error) throw new Error(response.error);
  if (response?.needsConfirmation) {
    document.getElementById('advice')!.textContent = response.advice;
    confirmation.hidden = false;
    document.getElementById('confirm-change')!.focus();
    return;
  }
  confirmation.hidden = true;
  await refresh(); status('Classification applied.');
}
document.getElementById('classification')!.addEventListener('submit', event => {
  event.preventDefault(); pending = chosen(); void apply(false).catch(error => status(error.message));
});
levels.addEventListener('change', () => { confirmation.hidden = true; describe(); });
document.getElementById('confirm-change')!.addEventListener('click', () => { void apply(true).catch(error => status(error.message)); });
document.getElementById('cancel-change')!.addEventListener('click', () => { confirmation.hidden = true; });
document.getElementById('settings')!.addEventListener('click', () => { void api.runtime.openOptionsPage(); });
void (async () => {
  const tabs = await api.tabs.query({ active: true, currentWindow: true, type: 'messageCompose' });
  if (tabs.length !== 1) throw new Error('Open this selector from a message composer.');
  tabId = tabs[0]!.id;
  await refresh();
})().catch(error => { (document.getElementById('apply') as HTMLButtonElement).disabled = true; status(error.message); });
