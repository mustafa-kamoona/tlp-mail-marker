/**
 * Accessible TLP classification selector.
 *
 * A native radio group wrapped in a shadow root, so it behaves exactly like a
 * form control (arrow-key navigation, focus ring, screen-reader semantics) while
 * remaining visually consistent with the webmail UI. Colour is never the only
 * signal: every option carries its text label and a tooltip.
 */

import { type TlpLevel, shortName } from '../../core/tlp.js';
import { t, tlpDescription, tlpSummary } from '../../utils/i18n.js';
import { createShadowHost, type UiTheme } from './styles.js';

export interface SelectorOptions {
  doc: Document;
  theme: UiTheme;
  colorCoding: boolean;
  /** Levels to offer (already filtered by policy / user settings). */
  levels: TlpLevel[];
  onChange: (level: TlpLevel | null) => void;
}

export interface SelectorController {
  readonly host: HTMLElement;
  getLevel(): TlpLevel | null;
  /** Set the selection without firing the change callback. */
  setLevel(level: TlpLevel | null, options?: { source?: string }): void;
  /** Explain where a preselected classification came from, or clear the note. */
  setDetectedNote(text: string | null): void;
  setWarning(text: string | null, tone?: 'warn' | 'error'): void;
  /** Highlight the selector to draw attention to it (e.g. after a blocked send). */
  setError(active: boolean): void;
  focus(): void;
  destroy(): void;
}

let instanceCounter = 0;

export function createSelector(options: SelectorOptions): SelectorController {
  const { doc, theme, colorCoding, levels, onChange } = options;
  const { host, root } = createShadowHost(doc, theme);
  const uid = `tlp-${++instanceCounter}`;
  const groupName = `${uid}-level`;
  const descId = `${uid}-desc`;
  const warningId = `${uid}-warning`;

  const container = doc.createElement('div');
  container.className = 'tlp-root';

  const head = doc.createElement('div');
  head.className = 'tlp-head';
  const title = doc.createElement('span');
  title.className = 'tlp-title';
  title.textContent = t('selectorTitle');
  const hint = doc.createElement('span');
  hint.className = 'tlp-hint';
  hint.textContent = t('selectorHint');
  head.append(title, hint);

  const group = doc.createElement('div');
  group.className = 'tlp-group';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', t('selectorGroupLabel'));
  group.setAttribute('aria-describedby', descId);

  const inputs = new Map<TlpLevel, HTMLInputElement>();

  for (const level of levels) {
    const label = doc.createElement('label');
    label.className = 'tlp-opt';
    label.title = tlpDescription(level);

    const input = doc.createElement('input');
    input.type = 'radio';
    input.name = groupName;
    input.value = level;
    input.setAttribute('aria-label', t('selectorOptionLabel', { level, summary: tlpSummary(level) }));
    inputs.set(level, input);

    const pill = doc.createElement('span');
    pill.className = 'tlp-pill';

    if (colorCoding) {
      const dot = doc.createElement('span');
      dot.className = 'tlp-dot';
      dot.setAttribute('data-level', level);
      dot.setAttribute('aria-hidden', 'true');
      pill.appendChild(dot);
    }

    const name = doc.createElement('span');
    name.className = 'tlp-name';
    name.textContent = shortName(level);
    pill.appendChild(name);

    label.append(input, pill);
    group.appendChild(label);
  }

  const actions = doc.createElement('div');
  actions.className = 'tlp-actions';

  const desc = doc.createElement('span');
  desc.className = 'tlp-desc';
  desc.id = descId;
  desc.setAttribute('aria-live', 'polite');

  const clear = doc.createElement('button');
  clear.type = 'button';
  clear.className = 'tlp-clear';
  clear.textContent = t('selectorClear');
  clear.title = t('selectorClearTitle');

  actions.append(desc, clear);

  const warning = doc.createElement('div');
  warning.className = 'tlp-warning';
  warning.id = warningId;
  warning.setAttribute('role', 'status');
  warning.setAttribute('aria-live', 'polite');

  container.append(head, group, actions, warning);
  root.appendChild(container);

  let detectedNote: string | null = null;

  const updateDescription = (): void => {
    const level = getLevel();
    if (level) {
      desc.textContent = tlpSummary(level);
    } else if (detectedNote) {
      desc.textContent = detectedNote;
    } else {
      desc.textContent = t('selectorNone');
    }
  };

  function getLevel(): TlpLevel | null {
    for (const [level, input] of inputs) {
      if (input.checked) {
        return level;
      }
    }
    return null;
  }

  function setLevel(level: TlpLevel | null): void {
    for (const [candidate, input] of inputs) {
      input.checked = candidate === level;
    }
    updateDescription();
  }

  const setError = (active: boolean): void => {
    container.setAttribute('data-error', active ? 'true' : 'false');
  };

  const handleChange = (event: Event): void => {
    const target = event.target as HTMLInputElement;
    if (target.type !== 'radio' || !target.checked) {
      return;
    }
    setError(false);
    updateDescription();
    onChange(getLevel());
  };

  const handleClear = (): void => {
    setError(false);
    setLevel(null);
    onChange(null);
  };

  group.addEventListener('change', handleChange);
  clear.addEventListener('click', handleClear);

  setLevel(null);
  updateDescription();

  return {
    host,
    getLevel,
    setLevel: (level, opts) => {
      setLevel(level);
      if (!opts?.source) {
        detectedNote = null;
      }
    },
    setDetectedNote: (text) => {
      detectedNote = text;
      if (!getLevel()) {
        updateDescription();
      }
    },
    setWarning: (text, tone = 'warn') => {
      warning.textContent = text ?? '';
      warning.setAttribute('data-tone', tone);
    },
    setError,
    focus: () => {
      const first = inputs.get(getLevel() ?? levels[0]!) ?? inputs.values().next().value;
      first?.focus();
      host.scrollIntoView?.({ block: 'nearest' });
    },
    destroy: () => {
      group.removeEventListener('change', handleChange);
      clear.removeEventListener('click', handleClear);
      host.remove();
    },
  };
}
