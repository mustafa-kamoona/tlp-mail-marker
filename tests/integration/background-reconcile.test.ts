import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../../src/core/settings.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('background script registration', () => {
  let settings: Settings;
  let settingsChanged: () => void;
  let permissionAdded: () => void;
  let permissionRemoved: () => void;
  let message: (value: unknown, sender: unknown, reply: (value: unknown) => void) => boolean;
  let scripts: Map<string, chrome.scripting.RegisteredContentScript>;
  let pendingIds: Set<string>;
  let registrationGate: ReturnType<typeof deferred>;
  let getRegistered: ReturnType<typeof vi.fn>;
  let register: ReturnType<typeof vi.fn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    settings = { ...DEFAULT_SETTINGS, domains: [{ host: 'mail.example.com', enabled: true }] };
    scripts = new Map();
    pendingIds = new Set();
    registrationGate = deferred();
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.doMock('../../src/utils/storage.js', () => ({
      loadSettings: async () => settings,
      watchStorageChanges: () => {},
      onSettingsChanged: (listener: () => void) => { settingsChanged = listener; },
    }));
    getRegistered = vi.fn(async () => [...scripts.values()]);
    register = vi.fn(async (registrations: chrome.scripting.RegisteredContentScript[]) => {
      for (const script of registrations) {
        if (scripts.has(script.id) || pendingIds.has(script.id)) {
          throw new Error(`Duplicate script ID '${script.id}'`);
        }
      }
      for (const script of registrations) pendingIds.add(script.id);
      await registrationGate.promise;
      for (const script of registrations) {
        scripts.set(script.id, script);
        pendingIds.delete(script.id);
      }
    });
    vi.stubGlobal('chrome', {
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
        onMessage: { addListener: (listener: typeof message) => { message = listener; } },
      },
      permissions: {
        getAll: async () => ({ origins: ['https://mail.example.com/*', 'http://mail.example.com/*'] }),
        onAdded: { addListener: (listener: () => void) => { permissionAdded = listener; } },
        onRemoved: { addListener: (listener: () => void) => { permissionRemoved = listener; } },
      },
      scripting: {
        getRegisteredContentScripts: getRegistered,
        registerContentScripts: register,
        updateContentScripts: vi.fn(async (registrations: chrome.scripting.RegisteredContentScript[]) => {
          for (const script of registrations) {
            if (!scripts.has(script.id)) throw new Error('Script is not registered');
            scripts.set(script.id, script);
          }
        }),
        unregisterContentScripts: vi.fn(async ({ ids }: { ids: string[] }) => {
          for (const id of ids) scripts.delete(id);
        }),
      },
    });
    await import('../../src/background/service-worker.js');
  });

  afterEach(() => {
    registrationGate.resolve();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.doUnmock('../../src/utils/storage.js');
  });

  function request(): Promise<unknown> {
    return new Promise((reply) => {
      expect(message({ type: 'tlp:reconcile' }, {}, reply)).toBe(true);
    });
  }

  async function flushEvents() {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }

  it('serializes overlapping permission, settings and popup events while registration is pending', async () => {
    const first = request();
    await flushEvents();
    expect(register).toHaveBeenCalledTimes(1);
    const second = request();
    permissionAdded();
    settingsChanged();
    await flushEvents();
    const readsWhilePending = getRegistered.mock.calls.length;
    registrationGate.resolve();
    await Promise.all([first, second, request()]);
    expect(readsWhilePending).toBe(1);
    expect(register).toHaveBeenCalledTimes(1);
    expect([...scripts.keys()].sort()).toEqual(['tlp-mail-marker-content', 'tlp-mail-marker-env']);
    expect(error).not.toHaveBeenCalled();
  });

  it.each(['disable', 'remove-host'])('applies %s after an in-flight registration completes', async (change) => {
    const first = request();
    await flushEvents();
    expect(register).toHaveBeenCalledTimes(1);
    settings = change === 'disable' ? { ...settings, enabled: false } : { ...settings, domains: [] };
    settingsChanged();
    permissionRemoved();
    const changed = request();
    await flushEvents();
    registrationGate.resolve();
    await Promise.all([first, changed]);
    expect(scripts.size).toBe(0);
    expect(error).not.toHaveBeenCalled();
  });

  it('continues reconciling after an API failure', async () => {
    getRegistered.mockRejectedValueOnce(new Error('Temporary API failure'));
    await request();
    registrationGate.resolve();
    await request();
    expect(scripts.size).toBe(2);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
