// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { RoundcubeAdapter } from '../../src/adapters/roundcube/roundcube-adapter.js';
import { MARKER_CLASS } from '../../src/core/html-marking.js';
import { normalizeSettings, type Settings } from '../../src/core/settings.js';
import { ComposerController } from '../../src/content/composer-controller.js';
import { createComposerFixture, type ComposerFixture } from './fixture.js';

const adapter = new RoundcubeAdapter();

interface Harness {
  fixture: ComposerFixture;
  controller: ComposerController;
  settings: Settings;
}

function makeHarness(
  options: Parameters<typeof createComposerFixture>[0],
  settingsOverrides: Partial<Settings> = {},
): Harness {
  const fixture = createComposerFixture(options);
  const settings = normalizeSettings({ missingClassification: 'block', ...settingsOverrides });
  const composer = adapter.findComposer(fixture.document, fixture.window.location as unknown as Location);
  if (!composer) {
    throw new Error('composer not found');
  }
  const controller = new ComposerController({
    doc: fixture.document,
    location: fixture.window.location as unknown as Location,
    composer,
    settings,
    theme: 'light',
  });
  controller.init();
  return { fixture, controller, settings };
}

function selectorHost(fixture: ComposerFixture): HTMLElement {
  const host = fixture.document.querySelector<HTMLElement>('.tlp-mail-marker-ui');
  if (!host || !host.shadowRoot) {
    throw new Error('selector host not found');
  }
  return host;
}

function selectLevel(fixture: ComposerFixture, level: string): void {
  const input = selectorHost(fixture).shadowRoot!.querySelector<HTMLInputElement>(`input[value="${level}"]`);
  if (!input) {
    throw new Error(`level ${level} not found`);
  }
  input.checked = true;
  input.dispatchEvent(new fixture.window.Event('change', { bubbles: true }));
}

function modal(fixture: ComposerFixture): HTMLElement | null {
  return fixture.document.querySelector<HTMLElement>('.tlp-modal-host');
}

describe('ComposerController', () => {
  it('injects a selector and applies a chosen classification', () => {
    const { fixture, controller } = makeHarness({});
    expect(controller.getSelectedLevel()).toBeNull();

    selectLevel(fixture, 'TLP:AMBER');
    expect(controller.getSelectedLevel()).toBe('TLP:AMBER');
    expect(fixture.subjectInput.value).toBe('[TLP:AMBER]');
    expect(fixture.textarea.value).toBe('TLP:AMBER');
  });

  it('prevents sending an unclassified message when configured to block', () => {
    const { fixture } = makeHarness({}, { missingClassification: 'block' });
    let propagated = false;
    fixture.sendControl!.addEventListener('click', () => {
      propagated = true;
    });

    fixture.sendControl!.click();

    expect(propagated).toBe(false);
    expect(modal(fixture)).not.toBeNull();
  });

  it('allows sending a correctly classified message', () => {
    const { fixture } = makeHarness({});
    selectLevel(fixture, 'TLP:AMBER');
    let propagated = false;
    fixture.sendControl!.addEventListener('click', () => {
      propagated = true;
    });

    fixture.sendControl!.click();

    expect(propagated).toBe(true);
    expect(modal(fixture)).toBeNull();
  });

  it('asks for confirmation before sending with a warning (missing classification)', () => {
    const { fixture } = makeHarness({}, { missingClassification: 'warn' });
    let propagated = false;
    fixture.sendControl!.addEventListener('click', () => {
      propagated = true;
    });

    fixture.sendControl!.click();

    expect(propagated).toBe(false);
    expect(modal(fixture)).not.toBeNull();
  });

  it('does not interfere when the missing-classification policy is off', () => {
    const { fixture } = makeHarness({}, { missingClassification: 'off' });
    let propagated = false;
    fixture.sendControl!.addEventListener('click', () => {
      propagated = true;
    });

    fixture.sendControl!.click();

    expect(propagated).toBe(true);
  });

  it('blocks a subject/body mismatch instead of silently fixing it', () => {
    const { fixture } = makeHarness({});
    selectLevel(fixture, 'TLP:AMBER');
    // Simulate the user hand-editing the subject to a different level.
    fixture.subjectInput.value = '[TLP:RED] Incident';

    let propagated = false;
    fixture.sendControl!.addEventListener('click', () => {
      propagated = true;
    });
    fixture.sendControl!.click();

    expect(propagated).toBe(false);
    expect(modal(fixture)).not.toBeNull();
  });

  it('preselects and preserves the original classification on reply', () => {
    const { fixture, controller } = makeHarness({
      url: 'https://mail.example.com/?_task=mail&_action=compose&_reply_uid=7',
      subject: '[TLP:AMBER] Incident',
      body: 'TLP:AMBER\n\n> quoted original',
    });

    expect(controller.getOriginalLevel()).toBe('TLP:AMBER');
    expect(controller.getSelectedLevel()).toBe('TLP:AMBER');
    expect(fixture.subjectInput.value).toBe('[TLP:AMBER] Incident');
    expect(fixture.textarea.value).toBe('TLP:AMBER\n\n> quoted original');
  });

  it('uses the MAIN-world compose mode when the URL has been rewritten', () => {
    const fixture = createComposerFixture({
      url: 'https://mail.example.com/?_task=mail&_action=compose&_id=opaque',
      subject: '[TLP:AMBER] Incident',
      body: 'TLP:AMBER\n\n> quoted original',
    });
    fixture.document.documentElement.setAttribute('data-tlp-compose-mode', 'reply');
    const settings = normalizeSettings({ missingClassification: 'block' });
    const composer = adapter.findComposer(fixture.document, fixture.window.location as unknown as Location)!;
    const controller = new ComposerController({
      doc: fixture.document,
      location: fixture.window.location as unknown as Location,
      composer,
      settings,
      theme: 'light',
    });
    controller.init();

    expect(controller.getOriginalLevel()).toBe('TLP:AMBER');
    expect(controller.getSelectedLevel()).toBe('TLP:AMBER');
  });

  it('adopts the original level when the environment probe arrives late', () => {
    const { fixture, controller } = makeHarness({ subject: '[TLP:RED] Incident', body: 'TLP:RED\n\n> quoted' });
    expect(controller.getOriginalLevel()).toBeNull();
    fixture.document.documentElement.setAttribute('data-tlp-compose-mode', 'forward');
    fixture.document.dispatchEvent(new fixture.window.CustomEvent('tlp-compose-env'));
    expect(controller.getOriginalLevel()).toBe('TLP:RED');
  });

  it('keeps the original level as the downgrade baseline when the user changed it before the probe arrived', () => {
    const { fixture, controller } = makeHarness({ subject: '[TLP:RED] Incident', body: 'TLP:RED\n\n> quoted' });
    selectLevel(fixture, 'TLP:GREEN');
    fixture.document.documentElement.setAttribute('data-tlp-compose-mode', 'reply');
    fixture.document.dispatchEvent(new fixture.window.CustomEvent('tlp-compose-env'));
    expect(controller.getOriginalLevel()).toBe('TLP:RED');
    expect(controller.getSelectedLevel()).toBe('TLP:GREEN');
  });

  it('offers only the levels permitted by policy', () => {
    const { fixture } = makeHarness({}, { allowedLevels: ['TLP:CLEAR', 'TLP:AMBER'] });
    const inputs = Array.from(selectorHost(fixture).shadowRoot!.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(inputs.map((input) => input.value)).toEqual(['TLP:CLEAR', 'TLP:AMBER']);
  });

  it('applies an administrator default level to a new message', () => {
    const { fixture, controller } = makeHarness({}, { defaultLevel: 'TLP:AMBER' });
    expect(controller.getSelectedLevel()).toBe('TLP:AMBER');
    expect(fixture.subjectInput.value).toBe('[TLP:AMBER]');
    expect(fixture.textarea.value).toBe('TLP:AMBER');
  });

  it('does not override a detected reply classification with the default', () => {
    const { controller } = makeHarness(
      {
        url: 'https://mail.example.com/?_task=mail&_action=compose&_reply_uid=9',
        subject: '[TLP:RED] Incident',
        body: 'TLP:RED\n\n> quoted',
      },
      { defaultLevel: 'TLP:GREEN' },
    );
    expect(controller.getSelectedLevel()).toBe('TLP:RED');
  });

  it('refuses to preselect a level that policy forbids', () => {
    const { fixture, controller } = makeHarness(
      {
        url: 'https://mail.example.com/?_task=mail&_action=compose&_reply_uid=9',
        subject: '[TLP:RED] Incident',
        body: 'TLP:RED\n\n> quoted',
      },
      { allowedLevels: ['TLP:CLEAR', 'TLP:GREEN'] },
    );
    expect(controller.getSelectedLevel()).toBeNull();
    expect(controller.getOriginalLevel()).toBe('TLP:RED');
    expect(fixture.subjectInput.value).toBe('[TLP:RED] Incident');
  });

  it('warns on downgrade in a reply and requires confirmation', () => {
    const { fixture } = makeHarness({
      url: 'https://mail.example.com/?_task=mail&_action=compose&_reply_uid=7',
      subject: '[TLP:RED] Incident',
      body: 'TLP:RED\n\n> quoted',
    });

    selectLevel(fixture, 'TLP:GREEN');
    expect(fixture.subjectInput.value).toBe('[TLP:GREEN] Incident');

    let propagated = false;
    fixture.sendControl!.addEventListener('click', () => {
      propagated = true;
    });
    fixture.sendControl!.click();

    expect(propagated).toBe(false);
    expect(modal(fixture)).not.toBeNull();
  });

  it('asks for confirmation when the quoted thread is more restrictive than the subject', () => {
    const { fixture } = makeHarness({
      url: 'https://mail.example.com/?_task=mail&_action=compose&_reply_uid=7',
      subject: 'Re: [TLP:GREEN] Weekly update',
      body: 'TLP:GREEN\n\nThanks\n\n> earlier message\n> TLP:RED credentials were rotated',
    });

    let propagated = false;
    fixture.sendControl!.addEventListener('click', () => {
      propagated = true;
    });
    fixture.sendControl!.click();

    expect(propagated).toBe(false);
    expect(modal(fixture)?.shadowRoot?.textContent ?? '').toContain('more restrictive');
  });

  it('works with the rich-text editor', () => {
    const { fixture, controller } = makeHarness({ html: '<p>Body</p>' });
    selectLevel(fixture, 'TLP:RED');
    expect(controller.getSelectedLevel()).toBe('TLP:RED');
    const editorBody = fixture.iframe!.contentDocument!.body;
    expect(editorBody.querySelectorAll(`.${MARKER_CLASS}`)).toHaveLength(1);
    expect(editorBody.textContent).toContain('TLP:RED');
    expect(editorBody.textContent).toContain('Body');
  });

  it('normalises the marking when the editor switches plain → HTML', async () => {
    const { fixture } = makeHarness({ body: 'Body' });
    selectLevel(fixture, 'TLP:AMBER');
    expect(fixture.textarea.value).toBe('TLP:AMBER\n\nBody');

    // Simulate Roundcube converting the body and mounting TinyMCE.
    fixture.addHtmlEditor('<div>TLP:AMBER</div><p>Body</p>');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const iframe = fixture.document.querySelector<HTMLIFrameElement>('iframe.tox-edit-area__iframe')!;
    const editorBody = iframe.contentDocument!.body;
    expect(editorBody.querySelectorAll(`.${MARKER_CLASS}`)).toHaveLength(1);
    expect((editorBody.textContent!.match(/TLP:AMBER/g) ?? []).length).toBe(1);
    expect(editorBody.textContent).toContain('Body');
  });

  it('clears markings when the classification is cleared', () => {
    const { fixture, controller } = makeHarness({});
    selectLevel(fixture, 'TLP:AMBER');
    const host = selectorHost(fixture);
    const clear = host.shadowRoot!.querySelector<HTMLButtonElement>('.tlp-clear')!;
    clear.click();
    expect(controller.getSelectedLevel()).toBeNull();
    expect(fixture.subjectInput.value).toBe('');
    expect(fixture.textarea.value).toBe('');
  });
});
