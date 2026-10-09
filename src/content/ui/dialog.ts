/**
 * Accessible, polished modal dialogs and toasts, rendered in a shadow root.
 *
 * Visual language follows the Bootstrap-based Roundcube Elastic skin (surface,
 * border, spacing, button variants) so the overlay looks native. Modal
 * presentation ideas were informed by how established webmail extensions
 * present warnings/editors (e.g. Mailvelope), reimplemented independently.
 *
 * No email content is ever passed as HTML: messages are strings/lists written
 * with textContent, and icons are built with the DOM API.
 */

import { createShadowHost, type UiTheme } from './styles.js';
import { t } from '../../utils/i18n.js';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export type DialogTone = 'info' | 'warn' | 'error';
export type DialogIcon = 'shield' | 'warn' | 'error' | 'info';

export interface DialogItem {
  text: string;
  tone?: DialogTone;
}

export interface DialogButton {
  label: string;
  value: string;
  variant?: 'primary' | 'secondary' | 'danger';
  autoFocus?: boolean;
}

export interface DialogSpec {
  title: string;
  subtitle?: string;
  message?: string;
  items?: Array<string | DialogItem>;
  icon?: DialogIcon;
  tone?: DialogTone;
  buttons: DialogButton[];
  /** Value returned when dismissed via Esc / backdrop / close. Omit to make the dialog non-dismissible. */
  dismissValue?: string;
}

// ---------------------------------------------------------------------------
// Icons (built with the DOM API — never innerHTML)
// ---------------------------------------------------------------------------

type IconName = DialogIcon | 'alert-circle' | 'close' | 'check';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(doc: Document, tag: string, attrs: Record<string, string>): SVGElement {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

export function createIcon(doc: Document, name: IconName, size = 20): SVGElement {
  const svg = svgEl(doc, 'svg', {
    viewBox: '0 0 24 24',
    width: String(size),
    height: String(size),
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  const add = (tag: string, attrs: Record<string, string>): void => {
    svg.appendChild(svgEl(doc, tag, attrs));
  };

  switch (name) {
    case 'shield':
      add('path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' });
      add('path', { d: 'M9 12l2 2 4-4' });
      break;
    case 'warn':
      add('path', { d: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' });
      add('line', { x1: '12', y1: '9', x2: '12', y2: '13' });
      add('line', { x1: '12', y1: '17', x2: '12.01', y2: '17' });
      break;
    case 'error':
      add('circle', { cx: '12', cy: '12', r: '9' });
      add('line', { x1: '12', y1: '8', x2: '12', y2: '13' });
      add('line', { x1: '12', y1: '16.5', x2: '12.01', y2: '16.5' });
      break;
    case 'alert-circle':
      add('circle', { cx: '12', cy: '12', r: '9' });
      add('line', { x1: '12', y1: '8.5', x2: '12', y2: '12.5' });
      add('line', { x1: '12', y1: '15.5', x2: '12.01', y2: '15.5' });
      break;
    case 'info':
      add('circle', { cx: '12', cy: '12', r: '9' });
      add('line', { x1: '12', y1: '11', x2: '12', y2: '16' });
      add('line', { x1: '12', y1: '8', x2: '12.01', y2: '8' });
      break;
    case 'close':
      add('line', { x1: '6', y1: '6', x2: '18', y2: '18' });
      add('line', { x1: '18', y1: '6', x2: '6', y2: '18' });
      break;
    case 'check':
      add('path', { d: 'M20 6 9 17l-5-5' });
      break;
  }
  return svg;
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function normalizeItems(items: Array<string | DialogItem> | undefined): DialogItem[] {
  if (!items) {
    return [];
  }
  return items.map((item) => (typeof item === 'string' ? { text: item } : item));
}

function trapFocus(doc: Document, host: HTMLElement, getFocusables: () => HTMLElement[]): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') {
      return;
    }
    const focusables = getFocusables();
    if (focusables.length === 0) {
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = doc.activeElement;
    if (event.shiftKey && (active === first || !host.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };
  doc.addEventListener('keydown', onKeyDown, true);
  return () => doc.removeEventListener('keydown', onKeyDown, true);
}

export function openDialog(doc: Document, theme: UiTheme, spec: DialogSpec): Promise<string> {
  return new Promise((resolve) => {
    const previousFocus = doc.activeElement as HTMLElement | null;
    const { host, root } = createShadowHost(doc, theme);
    host.className += ' tlp-modal-host';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483646';

    const backdrop = doc.createElement('div');
    backdrop.className = 'tlp-backdrop';

    const dialog = doc.createElement('div');
    dialog.className = 'tlp-dialog';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'tlp-dialog-title');

    const tone = spec.tone ?? 'info';

    const head = doc.createElement('div');
    head.className = 'tlp-dialog-head';

    const iconWrap = doc.createElement('div');
    iconWrap.className = 'tlp-dialog-icon';
    iconWrap.setAttribute('data-tone', tone);
    iconWrap.appendChild(createIcon(doc, spec.icon ?? 'info', 20));
    head.appendChild(iconWrap);

    const titles = doc.createElement('div');
    titles.className = 'tlp-dialog-titles';
    const heading = doc.createElement('h2');
    heading.id = 'tlp-dialog-title';
    heading.textContent = spec.title;
    titles.appendChild(heading);
    if (spec.subtitle) {
      const subtitle = doc.createElement('p');
      subtitle.className = 'tlp-subtitle';
      subtitle.textContent = spec.subtitle;
      titles.appendChild(subtitle);
    }
    head.appendChild(titles);

    let closeButton: HTMLButtonElement | null = null;
    if (spec.dismissValue !== undefined) {
      closeButton = doc.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'tlp-close';
      closeButton.setAttribute('aria-label', t('dialogClose'));
      closeButton.appendChild(createIcon(doc, 'close', 18));
      head.appendChild(closeButton);
    }
    dialog.appendChild(head);

    const body = doc.createElement('div');
    body.className = 'tlp-dialog-body';
    if (spec.message) {
      const p = doc.createElement('p');
      p.textContent = spec.message;
      body.appendChild(p);
    }
    const items = normalizeItems(spec.items);
    if (items.length) {
      const list = doc.createElement('ul');
      list.className = 'tlp-issues';
      for (const item of items) {
        const li = doc.createElement('li');
        const itemTone = item.tone ?? 'warn';
        li.setAttribute('data-tone', itemTone);
        const icon = doc.createElement('span');
        icon.className = 'tlp-issue-icon';
        icon.appendChild(createIcon(doc, itemTone === 'info' ? 'info' : 'alert-circle', 17));
        const text = doc.createElement('span');
        text.textContent = item.text;
        li.append(icon, text);
        list.appendChild(li);
      }
      body.appendChild(list);
    }
    dialog.appendChild(body);

    const foot = doc.createElement('div');
    foot.className = 'tlp-dialog-foot';
    const buttons: HTMLButtonElement[] = [];
    let initialFocus: HTMLElement | null = null;
    for (const buttonSpec of spec.buttons) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'tlp-btn';
      button.setAttribute('data-variant', buttonSpec.variant ?? 'secondary');
      button.textContent = buttonSpec.label;
      button.addEventListener('click', () => finish(buttonSpec.value));
      if (buttonSpec.autoFocus || (!initialFocus && buttonSpec.variant === 'primary')) {
        initialFocus = button;
      }
      buttons.push(button);
      foot.appendChild(button);
    }
    dialog.appendChild(foot);
    backdrop.appendChild(dialog);
    root.appendChild(backdrop);

    const getFocusables = (): HTMLElement[] =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('disabled'));

    const releaseTrap = trapFocus(doc, host, getFocusables);

    const finish = (value: string): void => {
      releaseTrap();
      doc.removeEventListener('keydown', onEsc, true);
      backdrop.removeEventListener('click', onBackdrop, true);
      host.remove();
      try {
        previousFocus?.focus?.();
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    const onEsc = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && spec.dismissValue !== undefined) {
        event.preventDefault();
        finish(spec.dismissValue);
      }
    };
    const onBackdrop = (event: MouseEvent): void => {
      if (event.target === backdrop && spec.dismissValue !== undefined) {
        finish(spec.dismissValue);
      }
    };
    closeButton?.addEventListener('click', () => finish(spec.dismissValue!));
    doc.addEventListener('keydown', onEsc, true);
    backdrop.addEventListener('click', onBackdrop, true);

    doc.body.appendChild(host);
    (initialFocus ?? buttons[0] ?? closeButton)?.focus();
  });
}

export interface AlertOptions {
  title: string;
  subtitle?: string;
  message?: string;
  items?: Array<string | DialogItem>;
  icon?: DialogIcon;
  tone?: DialogTone;
  okText?: string;
}

export async function showAlert(doc: Document, theme: UiTheme, options: AlertOptions): Promise<void> {
  await openDialog(doc, theme, {
    title: options.title,
    subtitle: options.subtitle,
    message: options.message,
    items: options.items,
    icon: options.icon,
    tone: options.tone,
    buttons: [{ label: options.okText ?? 'OK', value: 'ok', variant: 'primary', autoFocus: true }],
    dismissValue: 'ok',
  });
}

export interface ConfirmOptions {
  title: string;
  subtitle?: string;
  message?: string;
  items?: Array<string | DialogItem>;
  icon?: DialogIcon;
  tone?: DialogTone;
  confirmText?: string;
  cancelText?: string;
  /** If true, focus the confirm (destructive) button first. Defaults to focusing Cancel. */
  autoFocusConfirm?: boolean;
}

export async function showConfirm(doc: Document, theme: UiTheme, options: ConfirmOptions): Promise<boolean> {
  const value = await openDialog(doc, theme, {
    title: options.title,
    subtitle: options.subtitle,
    message: options.message,
    items: options.items,
    icon: options.icon,
    tone: options.tone,
    buttons: [
      {
        label: options.cancelText ?? 'Cancel',
        value: 'cancel',
        variant: 'secondary',
        autoFocus: !options.autoFocusConfirm,
      },
      {
        label: options.confirmText ?? 'Continue',
        value: 'confirm',
        variant: 'primary',
        autoFocus: options.autoFocusConfirm,
      },
    ],
    dismissValue: 'cancel',
  });
  return value === 'confirm';
}

export function showToast(doc: Document, theme: UiTheme, message: string, timeoutMs = 4000): void {
  const { host, root } = createShadowHost(doc, theme);
  const toast = doc.createElement('div');
  toast.className = 'tlp-toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  root.appendChild(toast);
  doc.body.appendChild(host);
  doc.defaultView?.setTimeout(() => host.remove(), timeoutMs);
}
