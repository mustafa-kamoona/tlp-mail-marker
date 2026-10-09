// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ATTACHED_ATTR, createComposerScanner, type ControllerLike } from '../../src/content/scanner.js';
import { createComposerFixture } from './fixture.js';

function makeControllerSpy() {
  const init = vi.fn();
  const destroy = vi.fn();
  const create = vi.fn((): ControllerLike => ({ init, destroy }));
  return { create, init, destroy };
}

function baseDeps(fixture: ReturnType<typeof createComposerFixture>, overrides: Partial<Parameters<typeof createComposerScanner>[0]> = {}) {
  return {
    doc: fixture.document,
    location: fixture.window.location as unknown as Location,
    isAuthorized: () => true,
    createController: makeControllerSpy().create,
    debounceMs: 10,
    ...overrides,
  };
}

describe('ComposerScanner', () => {
  it('attaches a controller to an authorised composer exactly once', () => {
    const fixture = createComposerFixture({ subject: 'Hi', body: 'Body' });
    const spy = makeControllerSpy();
    const scanner = createComposerScanner(baseDeps(fixture, { createController: spy.create }));

    scanner.start();
    scanner.scan();
    scanner.scan();

    expect(scanner.isAttached()).toBe(true);
    expect(spy.create).toHaveBeenCalledTimes(1);
    expect(spy.init).toHaveBeenCalledTimes(1);
    expect(fixture.form.getAttribute(ATTACHED_ATTR)).toBe('1');
    scanner.stop();
  });

  it('does nothing when the document is not authorised', () => {
    const fixture = createComposerFixture({ subject: 'Hi', body: 'Body' });
    const spy = makeControllerSpy();
    const scanner = createComposerScanner(baseDeps(fixture, { createController: spy.create, isAuthorized: () => false }));
    scanner.start();
    expect(scanner.isAttached()).toBe(false);
    expect(spy.create).not.toHaveBeenCalled();
    scanner.stop();
  });

  it('attaches a composer that appears after start', async () => {
    const fixture = createComposerFixture({ subject: 'Hi', body: 'Body' });
    fixture.form.remove();

    const spy = makeControllerSpy();
    const scanner = createComposerScanner(baseDeps(fixture, { createController: spy.create }));
    scanner.start();
    expect(scanner.isAttached()).toBe(false);

    fixture.document.body.appendChild(fixture.form);
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(scanner.isAttached()).toBe(true);
    expect(spy.create).toHaveBeenCalledTimes(1);
    scanner.stop();
  });

  it('detaches when the composer disappears', () => {
    const fixture = createComposerFixture({ subject: 'Hi', body: 'Body' });
    const spy = makeControllerSpy();
    const scanner = createComposerScanner(baseDeps(fixture, { createController: spy.create }));
    scanner.start();
    expect(scanner.isAttached()).toBe(true);

    fixture.textarea.remove();
    fixture.subjectInput.remove();
    scanner.scan();

    expect(scanner.isAttached()).toBe(false);
    expect(spy.destroy).toHaveBeenCalledTimes(1);
    expect(fixture.document.querySelector(`[${ATTACHED_ATTR}]`)).toBeNull();
    scanner.stop();
  });

  it('re-initialises on refresh', () => {
    const fixture = createComposerFixture({ subject: 'Hi', body: 'Body' });
    const spy = makeControllerSpy();
    const scanner = createComposerScanner(baseDeps(fixture, { createController: spy.create }));
    scanner.start();
    expect(spy.init).toHaveBeenCalledTimes(1);

    scanner.refresh();
    expect(spy.destroy).toHaveBeenCalledTimes(1);
    expect(spy.init).toHaveBeenCalledTimes(2);
    scanner.stop();
  });

  it('detaches on stop', () => {
    const fixture = createComposerFixture({ subject: 'Hi', body: 'Body' });
    const spy = makeControllerSpy();
    const scanner = createComposerScanner(baseDeps(fixture, { createController: spy.create }));
    scanner.start();
    expect(scanner.isAttached()).toBe(true);

    scanner.stop();
    expect(scanner.isAttached()).toBe(false);
    expect(spy.destroy).toHaveBeenCalledTimes(1);
    expect(fixture.document.querySelector(`[${ATTACHED_ATTR}]`)).toBeNull();
  });
});
