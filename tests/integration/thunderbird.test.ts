// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { ThunderbirdController } from '../../src/thunderbird/controller.js';
import { bodyText, initialContext, markDetails, thunderbirdSettings, validate } from '../../src/thunderbird/model.js';
import { DEFAULT_SETTINGS } from '../../src/core/settings.js';
import type { ComposeDetails, ThunderbirdApi } from '../../src/thunderbird/api.js';

function fixture(details: ComposeDetails, overrides = {}) {
  const session: Record<string, unknown> = {};
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  let current = { ...details };
  const api = {
    storage: {
      local: { get: async () => ({ settings }), set: vi.fn(), remove: vi.fn() },
      session: { get: async (key: string) => ({ [key]: session[key] }),
        set: async (values: Record<string, unknown>) => { Object.assign(session, values); },
        remove: async (key: string) => { delete session[key]; } },
    },
    compose: { getComposeDetails: async () => ({ ...current }),
      setComposeDetails: vi.fn(async (_id, changes) => { current = { ...current, ...changes }; }),
      listAttachments: async () => [] },
    composeAction: { setBadgeText: vi.fn(async () => {}), setTitle: vi.fn(async () => {}) },
    permissions: { contains: async () => false },
    messages: { get: vi.fn(), getFull: vi.fn() },
    tabs: { get: async () => ({ id: 1, type: 'messageCompose' }) },
    windows: { create: vi.fn(async () => ({ id: 99 })), remove: vi.fn(async () => {}) },
    runtime: { getURL: (path: string) => `moz-extension://test/${path}` },
  } as unknown as ThunderbirdApi;
  return { api, settings, session, controller: new ThunderbirdController(api), current: () => current,
    change: (changes: ComposeDetails) => { current = { ...current, ...changes }; } };
}
async function reviewToken(f: ReturnType<typeof fixture>) {
  await vi.waitFor(() => expect(f.api.windows.create).toHaveBeenCalled());
  const url = vi.mocked(f.api.windows.create).mock.calls.at(-1)![0].url;
  return new URL(url).searchParams.get('token')!;
}
const plain = { type: 'new', isPlainText: true, subject: 'Test', plainTextBody: 'Body\n\n-- \nSignature', to: ['recipient@example.com'] };

describe('Thunderbird composer', () => {
  it('marks plain text idempotently without touching recipients or attachments', () => {
    const marked = markDetails(plain, 'TLP:AMBER', DEFAULT_SETTINGS);
    expect(marked).toEqual({ subject: '[TLP:AMBER] Test', plainTextBody: 'TLP:AMBER\n\nBody\n\n-- \nSignature' });
    expect(markDetails({ ...plain, ...marked }, 'TLP:AMBER', DEFAULT_SETTINGS)).toEqual(marked);
    expect(markDetails({ ...plain, ...marked }, null, DEFAULT_SETTINGS)).toEqual({ subject: plain.subject, plainTextBody: plain.plainTextBody });
  });
  it('preserves HTML shell, quoted text, cid images, styles and attachments', () => {
    const original = '<!DOCTYPE html><html><head><style>p{color:red}</style></head><body bgcolor="white"><p>Message</p><img src="cid:photo"><blockquote><p>TLP:RED</p><p>Quoted</p></blockquote><div class="moz-signature">Signature</div></body></html>';
    const marked = markDetails({ subject: 'HTML', body: original, isPlainText: false }, 'TLP:AMBER', DEFAULT_SETTINGS);
    expect(marked.body).toContain('<head><style>p{color:red}</style></head><body bgcolor="white">');
    expect(marked.body).toContain('<img src="cid:photo">');
    expect(marked.body).toContain('<blockquote><p>TLP:RED</p><p>Quoted</p></blockquote>');
    expect(marked.body).toContain('<div class="moz-signature">Signature</div>');
    expect(bodyText(marked)).toContain('> TLP:RED');
    expect(markDetails({ body: marked.body }, 'TLP:AMBER', DEFAULT_SETTINGS).body).toBe(marked.body);
    expect(markDetails({ body: marked.body }, null, DEFAULT_SETTINGS).body).toBe(original);
  });
  it('never executes email scripts while parsing markings', () => {
    (globalThis as any).mailScriptRan = false;
    const details = { body: '<script>globalThis.mailScriptRan=true</script><p>Body</p>' };
    markDetails(details, 'TLP:RED', DEFAULT_SETTINGS);
    expect((globalThis as any).mailScriptRan).toBe(false);
  });
  it('retains conflicts and never applies a default to replies or conflicting messages', () => {
    const settings = { ...DEFAULT_SETTINGS, defaultLevel: 'TLP:GREEN' as const };
    expect(initialContext({ ...plain, type: 'reply' }, settings).selected).toBeNull();
    expect(initialContext({ ...plain, subject: '[TLP:RED] [TLP:CLEAR]' }, settings).selected).toBeNull();
    expect(initialContext(plain, settings).selected).toBe('TLP:GREEN');
  });
  it('removes webmail domain settings for the native build', () => {
    expect(thunderbirdSettings({ domains: ['mail.example.com'] }).domains).toEqual([]);
  });
  it('warns on higher quoted content', () => {
    const details = { ...plain, subject: '[TLP:GREEN] Test', plainTextBody: 'TLP:GREEN\n\n> TLP:RED\n> Original' };
    expect(validate(details, { selected: 'TLP:GREEN', original: null }, DEFAULT_SETTINGS).issues.some(i => i.code === 'QUOTED_HIGHER')).toBe(true);
  });
  it('requires confirmation before lowering a reply and remembers only labels', async () => {
    const f = fixture({ ...plain, type: 'reply', subject: '[TLP:RED] Test', plainTextBody: 'TLP:RED\n\nOriginal' });
    expect(await f.controller.apply(1, 'TLP:CLEAR')).toHaveProperty('needsConfirmation', true);
    expect(f.api.compose.setComposeDetails).not.toHaveBeenCalled();
    await f.controller.apply(1, 'TLP:CLEAR', true);
    expect(f.session['compose-1']).toEqual({ selected: 'TLP:CLEAR', original: 'TLP:RED' });
    expect(await f.controller.state(1)).toHaveProperty('original', 'TLP:RED');
    await f.controller.tabClosed(1); expect(f.session).toEqual({});
  });
  it('restores classification context after an MV3 background restart', async () => {
    const f = fixture({ ...plain, type: 'reply', subject: '[TLP:RED] Test' });
    await f.controller.apply(1, 'TLP:CLEAR', true);
    expect(await new ThunderbirdController(f.api).state(1)).toHaveProperty('original', 'TLP:RED');
  });
  it('reads the original only after optional permission is granted', async () => {
    const f = fixture({ ...plain, type: 'reply', relatedMessageId: 7 });
    f.api.permissions.contains = async () => true;
    f.api.messages.get = vi.fn(async () => ({ subject: '[TLP:RED] Original' }));
    f.api.messages.getFull = vi.fn(async () => ({ contentType: 'text/plain', body: 'Original' }));
    expect(await f.controller.state(1)).toHaveProperty('original', 'TLP:RED');
    const noPermission = fixture({ ...plain, type: 'reply', relatedMessageId: 7 });
    await noPermission.controller.state(1);
    expect(noPermission.api.messages.get).not.toHaveBeenCalled();
  });
  it('preserves edits made while source-message detection is pending', async () => {
    const f = fixture({ ...plain, type: 'reply', relatedMessageId: 7 });
    let sourceReady!: (header: { subject: string }) => void;
    f.api.permissions.contains = async () => true;
    f.api.messages.get = vi.fn(() => new Promise<{ subject: string }>(resolve => { sourceReady = resolve; }));
    f.api.messages.getFull = async () => ({ contentType: 'text/plain', body: 'Original' });
    const initialization = f.controller.initialize({ id: 1, type: 'messageCompose' });
    await vi.waitFor(() => expect(f.api.messages.get).toHaveBeenCalled());
    f.change({ plainTextBody: 'User edited this during detection', subject: 'Edited subject' });
    sourceReady({ subject: '[TLP:RED] Original' }); await initialization;
    expect(f.current().plainTextBody).toContain('User edited this during detection');
    expect(f.current().subject).toBe('[TLP:RED] Edited subject');
  });
  it('allows a valid message without showing a review', async () => {
    const f = fixture({ ...plain, ...markDetails(plain, 'TLP:AMBER', DEFAULT_SETTINGS) });
    expect(await f.controller.beforeSend({ id: 1 }, f.current())).toEqual({ cancel: false });
    expect(f.api.windows.create).not.toHaveBeenCalled();
  });
  it('allows sending while explicitly disabled', async () => {
    const f = fixture(plain, { enabled: false });
    expect(await f.controller.beforeSend({ id: 1 }, f.current())).toEqual({ cancel: false });
  });
  it('refuses invalid levels and forbidden classifications', async () => {
    const f = fixture(plain, { allowedLevels: ['TLP:RED'] });
    await expect(f.controller.apply(1, 'TLP:WHITE')).rejects.toThrow();
    await expect(f.controller.apply(1, 'TLP:GREEN')).rejects.toThrow();
  });
  it('cancels sending when the review window closes', async () => {
    const f = fixture(plain);
    const send = f.controller.beforeSend({ id: 1 }, f.current());
    await reviewToken(f); f.controller.windowClosed(99);
    expect(await send).toEqual({ cancel: true });
  });
  it('cancels if a review closes before window creation resolves', async () => {
    const f = fixture(plain);
    let created!: (window: { id: number }) => void;
    f.api.windows.create = vi.fn(() => new Promise<{ id: number }>(resolve => { created = resolve; }));
    const send = f.controller.beforeSend({ id: 1 }, f.current());
    await reviewToken(f);
    f.controller.windowClosed(99); created({ id: 99 });
    expect(await send).toEqual({ cancel: true });
  });
  it('accepts a bound review before the OS finishes focusing its window', async () => {
    const f = fixture(plain);
    f.api.windows.create = vi.fn(() => new Promise<{ id: number }>(() => {}));
    const send = f.controller.beforeSend({ id: 1 }, f.current());
    const token = await reviewToken(f);
    f.controller.bindReview(token, 99);
    await f.controller.decide(token, true);
    expect(await send).toEqual({ cancel: false });
    expect(f.api.windows.remove).toHaveBeenCalledWith(99);
  });
  it('never permits an error to be bypassed', async () => {
    const f = fixture(plain, { missingClassification: 'block' });
    const send = f.controller.beforeSend({ id: 1 }, f.current());
    const token = await reviewToken(f);
    expect(f.controller.review(token).canContinue).toBe(false);
    expect(await f.controller.decide(token, true)).toEqual({ changed: true });
    await f.controller.decide(token, false); expect(await send).toEqual({ cancel: true });
  });
  it('consumes a warning approval exactly once', async () => {
    const f = fixture(plain);
    const send = f.controller.beforeSend({ id: 1 }, f.current());
    const token = await reviewToken(f);
    await f.controller.decide(token, true); expect(await send).toEqual({ cancel: false });
    expect(() => f.controller.review(token)).toThrow('expired');
    const next = f.controller.beforeSend({ id: 1 }, f.current());
    await vi.waitFor(() => expect(f.api.windows.create).toHaveBeenCalledTimes(2));
    f.controller.windowClosed(99); expect(await next).toEqual({ cancel: true });
  });
  it.each(['subject', 'plainTextBody', 'to'])('rejects an approval if %s changes', async key => {
    const f = fixture(plain);
    const send = f.controller.beforeSend({ id: 1 }, f.current());
    const token = await reviewToken(f);
    f.change({ [key]: key === 'to' ? ['other@example.com'] : 'Changed' });
    expect(await f.controller.decide(token, true)).toEqual({ changed: true });
    await f.controller.decide(token, false); expect(await send).toEqual({ cancel: true });
  });
  it('cancels rather than sending if validation cannot run', async () => {
    const f = fixture(plain); f.api.compose.listAttachments = async () => { throw new Error('Unavailable'); };
    expect(await f.controller.beforeSend({ id: 1 }, f.current())).toEqual({ cancel: true });
  });
  it.each(['attachments', 'settings'])('rejects an approval after %s change', async part => {
    const f = fixture(plain);
    const send = f.controller.beforeSend({ id: 1 }, f.current());
    const token = await reviewToken(f);
    if (part === 'attachments') f.api.compose.listAttachments = async () => [{ id: 2, name: 'new.txt', size: 10 }];
    else f.settings.missingClassification = 'block';
    expect(await f.controller.decide(token, true)).toEqual({ changed: true });
    await f.controller.decide(token, false);
    expect(await send).toEqual({ cancel: true });
  });
});
