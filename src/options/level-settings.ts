import { TLP_LEVELS, type TlpLevel } from '../core/tlp.js';
import type { Settings } from '../core/settings.js';

export function renderLevelSettings(root: Document, settings: Settings, locks: Set<string> = new Set()): void {
  const levels = root.getElementById('allowed-levels')!;
  levels.replaceChildren();
  const legend = root.createElement('legend'); legend.textContent = 'Approved classifications'; levels.appendChild(legend);
  for (const level of TLP_LEVELS) {
    const label = root.createElement('label');
    const input = root.createElement('input'); input.type = 'checkbox'; input.value = level;
    input.checked = settings.allowedLevels.includes(level); input.disabled = locks.has('allowedLevels');
    label.append(input, root.createTextNode(level)); levels.appendChild(label);
  }
  const select = root.getElementById('default-level') as HTMLSelectElement;
  select.replaceChildren();
  for (const value of ['', ...settings.allowedLevels]) {
    const option = root.createElement('option'); option.value = value; option.textContent = value || 'Ask me to choose'; select.appendChild(option);
  }
  select.value = settings.defaultLevel ?? ''; select.disabled = locks.has('defaultLevel');
  root.getElementById('level-policy-status')!.textContent = locks.has('allowedLevels') || locks.has('defaultLevel')
    ? 'Administrator policy controls the disabled settings.' : '';
}

export function readLevelSettings(root: Document): Pick<Settings, 'allowedLevels' | 'defaultLevel'> {
  const allowedLevels = [...root.querySelectorAll<HTMLInputElement>('#allowed-levels input:checked')].map(input => input.value as TlpLevel);
  if (!allowedLevels.length) throw new Error('Approve at least one classification.');
  const value = (root.getElementById('default-level') as HTMLSelectElement).value as TlpLevel | '';
  // Removing a default from the approved list resets it to "Ask me to choose".
  return { allowedLevels, defaultLevel: value && allowedLevels.includes(value) ? value : null };
}
