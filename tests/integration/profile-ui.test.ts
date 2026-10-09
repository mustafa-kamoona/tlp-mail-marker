// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { bindProfileControls } from '../../src/options/profile-ui.js';
import { normalizeSettings } from '../../src/core/settings.js';
import type { ManagedPolicy } from '../../src/core/managed.js';

const profile = { format: 'tlp-mail-marker-profile', version: 1, name: '<img src=x onerror=alert(1)>', settings: {
  allowedLevels: ['TLP:GREEN'], defaultLevel: 'TLP:GREEN', missingClassification: 'block',
} };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function select(text: string, size?: number) {
  const file = document.getElementById('profile-file') as HTMLInputElement;
  Object.defineProperty(file, 'files', { configurable: true, value: [{ size: size ?? text.length, text: async () => text }] });
  file.dispatchEvent(new Event('change'));
}
describe.each(['options/options.html', 'thunderbird/options.html'])('profile UI in %s', page => {
  beforeEach(() => { document.documentElement.innerHTML = readFileSync(`src/${page}`, 'utf8'); });
  it('previews inert names and changes nothing until Apply', async () => {
    const user = normalizeSettings({ domains: ['mail.example.com'] }), save = vi.fn();
    bindProfileControls(document, { read: async () => ({ user, policy: {} }), save });
    select(JSON.stringify(profile)); await tick();
    expect(document.getElementById('profile-preview')!.textContent).toContain(profile.name);
    expect(document.querySelector('#profile-preview img')).toBeNull();
    expect(save).not.toHaveBeenCalled();
    document.getElementById('profile-apply')!.click(); await tick();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ ...profile.settings, domains: user.domains }));
    expect((document.getElementById('profile-apply') as HTMLButtonElement).disabled).toBe(true);
  });
  it('clears a valid preview when a new invalid/oversized file is selected', async () => {
    const save = vi.fn();
    bindProfileControls(document, { read: async () => ({ user: normalizeSettings({}), policy: {} }), save });
    select(JSON.stringify(profile)); await tick();
    for (const [text, size] of [['{}', 2], [JSON.stringify(profile), 17000]] as const) {
      select(text, size); await tick(); document.getElementById('profile-apply')!.click();
      expect((document.getElementById('profile-apply') as HTMLButtonElement).disabled).toBe(true);
      expect(document.getElementById('profile-preview')!.textContent).toBe('');
    }
    expect(save).not.toHaveBeenCalled();
  });
  it('honours policy and settings changed after preview', async () => {
    let user = normalizeSettings({}), policy: ManagedPolicy = {};
    const save = vi.fn();
    bindProfileControls(document, { read: async () => ({ user, policy }), save });
    select(JSON.stringify(profile)); await tick();
    user = normalizeSettings({ domains: ['changed.example.com'], theme: 'dark', missingClassification: 'warn' });
    policy = { missingClassification: 'off' };
    document.getElementById('profile-apply')!.click(); await tick();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ domains: user.domains, theme: 'dark', missingClassification: 'warn' }));
  });
  it('keeps a failed save available for retry and reports the error', async () => {
    bindProfileControls(document, { read: async () => ({ user: normalizeSettings({}), policy: {} }), save: async () => { throw new Error('Storage unavailable'); } });
    select(JSON.stringify(profile)); await tick(); document.getElementById('profile-apply')!.click(); await tick();
    expect(document.getElementById('profile-status')!.textContent).toBe('Storage unavailable');
    expect((document.getElementById('profile-apply') as HTMLButtonElement).disabled).toBe(false);
    expect((document.getElementById('profile-file') as HTMLInputElement).disabled).toBe(false);
  });
});
