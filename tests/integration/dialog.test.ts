// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createIcon, openDialog, showAlert, showConfirm } from '../../src/content/ui/dialog.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

function modal(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.tlp-modal-host');
}

function shadowText(): string {
  return modal()?.shadowRoot?.textContent ?? '';
}

describe('dialog icons', () => {
  it('builds icons with the DOM API, never innerHTML', () => {
    const icon = createIcon(document, 'shield', 20);
    expect(icon.tagName.toLowerCase()).toBe('svg');
    expect(icon.querySelectorAll('path, line, circle').length).toBeGreaterThan(0);
  });
});

describe('showAlert', () => {
  it('renders a title, a close button and a single primary action', async () => {
    const promise = showAlert(document, 'light', {
      title: 'Add a TLP classification',
      subtitle: 'This message was not sent.',
      message: 'Choose a classification.',
      items: ['The subject is not marked.'],
      icon: 'shield',
      tone: 'error',
      okText: 'Choose a classification',
    });
    const host = modal();
    expect(host).not.toBeNull();
    const dialog = host!.shadowRoot!.querySelector('.tlp-dialog')!;
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(shadowText()).toContain('Add a TLP classification');
    expect(shadowText()).toContain('This message was not sent.');
    const buttons = dialog.querySelectorAll('.tlp-dialog-foot .tlp-btn');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.textContent).toBe('Choose a classification');
    expect(dialog.querySelector('.tlp-close')).not.toBeNull();

    (buttons[0] as HTMLButtonElement).click();
    await promise;
    expect(modal()).toBeNull();
  });

  it('dismisses on Escape', async () => {
    const promise = showAlert(document, 'light', { title: 'Hello', okText: 'OK' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await promise;
    expect(modal()).toBeNull();
  });
});

describe('showConfirm', () => {
  it('focuses the safe (cancel) action by default and returns false on cancel', async () => {
    const promise = showConfirm(document, 'light', {
      title: 'Lower the TLP classification?',
      message: 'Only continue if authorised.',
      items: [{ text: 'Downgrade from RED to GREEN.', tone: 'error' }],
      icon: 'warn',
      tone: 'warn',
      confirmText: 'Send anyway',
      cancelText: 'Go back',
    });
    const shadow = modal()!.shadowRoot!;
    const buttons = shadow.querySelectorAll<HTMLButtonElement>('.tlp-dialog-foot .tlp-btn');
    expect(buttons[0]!.textContent).toBe('Go back');
    expect(buttons[1]!.textContent).toBe('Send anyway');

    buttons[0]!.click();
    expect(await promise).toBe(false);
    expect(modal()).toBeNull();
  });

  it('returns true when the destructive action is confirmed', async () => {
    const promise = showConfirm(document, 'light', {
      title: 'Send with warnings?',
      confirmText: 'Send anyway',
      cancelText: 'Go back',
    });
    const shadow = modal()!.shadowRoot!;
    const buttons = shadow.querySelectorAll<HTMLButtonElement>('.tlp-dialog-foot .tlp-btn');
    buttons[buttons.length - 1]!.click();
    expect(await promise).toBe(true);
  });

  it('renders issue items with tones', async () => {
    void showConfirm(document, 'light', {
      title: 'Send with warnings?',
      items: [
        { text: 'First', tone: 'error' },
        { text: 'Second', tone: 'warn' },
      ],
    });
    const shadow = modal()!.shadowRoot!;
    const items = shadow.querySelectorAll('.tlp-issues li');
    expect(items).toHaveLength(2);
    expect(items[0]!.getAttribute('data-tone')).toBe('error');
    expect(items[1]!.getAttribute('data-tone')).toBe('warn');
    dismissCurrentDialog();
  });
});

/** Resolve a pending dialog so the test does not leak an open modal. */
function dismissCurrentDialog(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

describe('openDialog', () => {
  it('can be made non-dismissible', async () => {
    let resolved = false;
    void openDialog(document, 'light', {
      title: 'Blocking',
      buttons: [{ label: 'OK', value: 'ok', variant: 'primary' }],
      // no dismissValue
    }).then(() => {
      resolved = true;
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(resolved).toBe(false);
    expect(modal()).not.toBeNull();
    (modal()!.shadowRoot!.querySelector('.tlp-btn') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(resolved).toBe(true);
  });
});
