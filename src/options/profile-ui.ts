import { applyProfile, exportProfile, parseProfile, PROFILE_MAX_BYTES, type OrganisationProfile } from '../core/profile.js';
import { applyManagedPolicy, managedLockedKeys, type ManagedPolicy } from '../core/managed.js';
import type { Settings } from '../core/settings.js';

export interface ProfileHost {
  read(): Promise<{ user: Settings; policy: ManagedPolicy }>;
  save(settings: Settings): Promise<void>;
}

/** Both extension options pages use the same explicit preview/apply flow. */
export function bindProfileControls(root: Document, host: ProfileHost): void {
  const get = <T extends HTMLElement>(id: string) => root.getElementById(id) as T;
  const file = get<HTMLInputElement>('profile-file'), name = get<HTMLInputElement>('profile-name');
  const preview = get<HTMLElement>('profile-preview'), status = get<HTMLElement>('profile-status');
  const apply = get<HTMLButtonElement>('profile-apply'), save = get<HTMLButtonElement>('profile-export');
  let pending: OrganisationProfile | null = null, generation = 0;
  const error = (value: unknown) => { status.textContent = value instanceof Error ? value.message : String(value); };
  file.addEventListener('change', () => {
    const current = ++generation;
    pending = null; apply.disabled = true; preview.textContent = ''; status.textContent = '';
    const selected = file.files?.[0];
    if (!selected) return;
    void (async () => {
      if (selected.size > PROFILE_MAX_BYTES) throw new Error('The profile must be smaller than 16 KB.');
      const profile = parseProfile(await selected.text());
      const { user, policy } = await host.read();
      if (generation !== current) return;
      const effective = applyManagedPolicy(applyProfile(user, profile, policy), policy);
      const rules = { off: 'Do nothing', warn: 'Warn before sending', block: 'Require a classification' };
      const locks = [...managedLockedKeys(policy)].filter(key => Object.hasOwn(profile.settings, key));
      // textContent keeps untrusted profile names and errors inert.
      preview.textContent = `${profile.name}\nApproved levels: ${effective.allowedLevels.join(', ')}\nDefault: ${effective.defaultLevel ?? 'Ask me to choose'}\nWithout a classification: ${rules[effective.missingClassification]}`
        + (locks.length ? `\nAdministrator policy takes priority for: ${locks.join(', ')}.` : '')
        + (!effective.enabled ? '\nTLP Mail Marker is currently disabled. Enable it to use these checks.' : '');
      pending = profile; apply.disabled = false;
    })().catch(value => { if (current === generation) error(value); });
  });
  apply.addEventListener('click', () => {
    const profile = pending;
    if (!profile) return;
    apply.disabled = true; file.disabled = true;
    void (async () => {
      // Re-read policy/settings in case another options page changed them.
      const { user, policy } = await host.read();
      await host.save(applyProfile(user, profile, policy));
      pending = null; preview.textContent = ''; file.value = ''; ++generation;
      status.textContent = `Applied ${profile.name}.`;
    })().catch(value => { error(value); apply.disabled = !pending; }).finally(() => { file.disabled = false; });
  });
  save.addEventListener('click', () => {
    const profileName = name.value;
    save.disabled = true;
    void (async () => {
      const { user, policy } = await host.read();
      const text = exportProfile(applyManagedPolicy(user, policy), profileName);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = root.createElement('a'); link.href = url; link.download = 'tlp-organisation-profile.json';
      root.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = 'Profile exported. Share it with your organisation.';
    })().catch(error).finally(() => { save.disabled = false; });
  });
}
