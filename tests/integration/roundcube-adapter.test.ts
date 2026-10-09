// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { RoundcubeAdapter } from '../../src/adapters/roundcube/roundcube-adapter.js';
import { MARKER_CLASS } from '../../src/core/html-marking.js';
import { createComposerFixture, createUnsupportedFixture } from './fixture.js';

const adapter = new RoundcubeAdapter();

function composerOf(fixture: ReturnType<typeof createComposerFixture>) {
  const composer = adapter.findComposer(fixture.document, fixture.window.location as unknown as Location);
  if (!composer) {
    throw new Error('composer not found');
  }
  return composer;
}

describe('RoundcubeAdapter', () => {
  it('recognises a composer and exposes its handles', () => {
    const fixture = createComposerFixture({ subject: 'Hello' });
    expect(adapter.supports(fixture.document, fixture.window.location as unknown as Location)).toBe(true);

    const composer = composerOf(fixture);
    expect(composer.adapterId).toBe('roundcube');
    expect(composer.form).toBe(fixture.form);
    expect(composer.subject).toBe(fixture.subjectInput);
    expect(composer.uiAnchor()).toBe(fixture.document.getElementById('compose_subject'));
  });

  it('does not recognise an unrelated page', () => {
    const fixture = createUnsupportedFixture();
    expect(adapter.supports(fixture.document, fixture.window.location as unknown as Location)).toBe(false);
    expect(adapter.findComposer(fixture.document, fixture.window.location as unknown as Location)).toBeNull();
  });

  it('detects send and save-draft controls', () => {
    const composer = composerOf(createComposerFixture({}));
    expect(composer.sendControls()).toHaveLength(1);
    expect(composer.saveDraftControls()).toHaveLength(1);
  });

  it('infers reply/forward intent from the URL', () => {
    const reply = composerOf(
      createComposerFixture({ url: 'https://mail.example.com/?_task=mail&_action=compose&_reply_uid=5' }),
    );
    expect(reply.isReplyOrForward()).toBe(true);

    const fresh = composerOf(createComposerFixture({}));
    expect(fresh.isReplyOrForward()).toBe(false);
  });
});

describe('plain-text body', () => {
  it('reads, marks and removes', () => {
    const fixture = createComposerFixture({ body: 'Dear colleagues' });
    const composer = composerOf(fixture);
    expect(composer.body.mode()).toBe('plain');
    expect(composer.body.readText()).toBe('Dear colleagues');
    expect(composer.body.leadingLevel()).toBeNull();

    composer.body.apply('TLP:AMBER', { colorCoding: true });
    expect(fixture.textarea.value).toBe('TLP:AMBER\n\nDear colleagues');
    expect(composer.body.leadingLevel()).toBe('TLP:AMBER');

    composer.body.apply('TLP:RED', { colorCoding: true });
    expect(fixture.textarea.value).toBe('TLP:RED\n\nDear colleagues');

    composer.body.remove();
    expect(fixture.textarea.value).toBe('Dear colleagues');
  });
});

describe('rich-text body', () => {
  it('reads, marks and removes inside the editor iframe', () => {
    const fixture = createComposerFixture({ html: '<p>Dear colleagues</p>' });
    const composer = composerOf(fixture);
    expect(composer.body.mode()).toBe('html');
    expect(composer.body.readText()).toContain('Dear colleagues');
    expect(composer.body.leadingLevel()).toBeNull();

    composer.body.apply('TLP:AMBER', { colorCoding: true });
    const editorBody = fixture.iframe!.contentDocument!.body;
    expect(editorBody.querySelectorAll(`.${MARKER_CLASS}`)).toHaveLength(1);
    expect(composer.body.leadingLevel()).toBe('TLP:AMBER');
    expect(composer.body.readText()).toContain('Dear colleagues');

    // applying again does not duplicate
    composer.body.apply('TLP:AMBER', { colorCoding: true });
    expect(editorBody.querySelectorAll(`.${MARKER_CLASS}`)).toHaveLength(1);

    composer.body.remove();
    expect(editorBody.querySelectorAll(`.${MARKER_CLASS}`)).toHaveLength(0);
  });

  it('normalises a marker adopted from plain→HTML conversion', () => {
    const fixture = createComposerFixture({ html: '<div>TLP:GREEN</div><p>Body</p>' });
    const composer = composerOf(fixture);
    expect(composer.body.leadingLevel()).toBe('TLP:GREEN');
    composer.body.apply('TLP:GREEN', { colorCoding: true });
    const editorBody = fixture.iframe!.contentDocument!.body;
    expect(editorBody.querySelectorAll(`.${MARKER_CLASS}`)).toHaveLength(1);
    expect((editorBody.textContent!.match(/TLP:GREEN/g) ?? []).length).toBe(1);
    expect(editorBody.textContent).toContain('Body');
  });
});

describe('mode observation', () => {
  it('notifies when the editor appears (plain → HTML)', async () => {
    const fixture = createComposerFixture({ body: 'Body' });
    const composer = composerOf(fixture);
    const callback = vi.fn();
    const dispose = composer.observe(callback);

    fixture.addHtmlEditor('<p>Body</p>');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callback).toHaveBeenCalled();

    dispose();
  });
});
