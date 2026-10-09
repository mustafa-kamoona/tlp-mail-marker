import { assessChange, detectEffectiveClassification } from '../core/policy.js';
import { SETTINGS_KEY, type Settings } from '../core/settings.js';
import { isTlpLevel, type TlpLevel } from '../core/tlp.js';
import type { ValidationIssue } from '../core/validation.js';
import type { ComposeDetails, MailPart, MailTab, ThunderbirdApi } from './api.js';
import { bodyText, initialContext, markDetails, readContext, reviewDigest, thunderbirdSettings, validate, type ComposeContext } from './model.js';

interface Review {
  tabId: number; digest: string; issues: ValidationIssue[]; canContinue: boolean;
  resolve: (continueSend: boolean) => void; windowId?: number;
}

export class ThunderbirdController {
  private initializing = new Map<number, Promise<ComposeContext>>();
  private mutations = new Map<number, Promise<unknown>>();
  private reviews = new Map<string, Review>();
  constructor(private api: ThunderbirdApi) {}
  private async serialize<T>(id: number, work: () => Promise<T>): Promise<T> {
    const pending = (this.mutations.get(id) ?? Promise.resolve()).catch(() => undefined).then(work);
    this.mutations.set(id, pending);
    try { return await pending; }
    finally { if (this.mutations.get(id) === pending) this.mutations.delete(id); }
  }
  async settings(): Promise<Settings> {
    return thunderbirdSettings((await this.api.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);
  }
  private key(id: number) { return `compose-${id}`; }
  private async remember(id: number, context: ComposeContext): Promise<void> {
    await this.api.storage.session.set({ [this.key(id)]: context });
    await this.api.composeAction.setBadgeText({ tabId: id, text: context.selected?.replace('TLP:', '') ?? '' });
    await this.api.composeAction.setTitle({ tabId: id, title: context.selected ?? 'Choose a TLP classification' });
  }
  private async original(details: ComposeDetails): Promise<TlpLevel | null> {
    if (!['reply', 'forward'].includes(details.type ?? '') || details.relatedMessageId == null
      || !await this.api.permissions.contains({ permissions: ['messagesRead'] })) return null;
    try {
      const header = await this.api.messages.get(details.relatedMessageId);
      const full = await this.api.messages.getFull(details.relatedMessageId);
      const text = (part: MailPart, depth = 0): string => {
        if (depth > 20) return '';
        if (part.body && part.contentType === 'text/plain') return part.body;
        if (part.body && part.contentType === 'text/html') return bodyText({ body: part.body });
        return (part.parts ?? []).map(p => text(p, depth + 1)).join('\n');
      };
      return detectEffectiveClassification({ subject: header.subject, body: text(full) }).level;
    } catch { return null; } // Quoted text remains covered by the shared validator.
  }
  async context(id: number, details: ComposeDetails, settings: Settings): Promise<ComposeContext> {
    const saved = readContext((await this.api.storage.session.get(this.key(id)))[this.key(id)]);
    if (saved) return saved;
    if (this.initializing.has(id)) return this.initializing.get(id)!;
    const pending = (async () => {
      const context = initialContext(details, settings);
      context.original = await this.original(details) ?? context.original;
      if (context.original && !context.selected) context.selected = context.original;
      if (context.selected && !settings.allowedLevels.includes(context.selected)) context.selected = null;
      await this.remember(id, context);
      return context;
    })();
    this.initializing.set(id, pending);
    try { return await pending; } finally { this.initializing.delete(id); }
  }
  async initialize(tab: MailTab): Promise<void> {
    if (tab.type !== 'messageCompose') return;
    return this.serialize(tab.id, async () => {
      // onCreated can precede the compose editor's initialization.
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const settings = await this.settings();
          if (!settings.enabled) return;
          const details = await this.api.compose.getComposeDetails(tab.id);
          const context = await this.context(tab.id, details, settings);
          // Source-message access is asynchronous. Preserve any edits made while
          // it was pending instead of writing the stale initial message back.
          const current = await this.api.compose.getComposeDetails(tab.id);
          if (context.selected) await this.api.compose.setComposeDetails(tab.id, markDetails(current, context.selected, settings));
          return;
        } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
      }
    });
  }
  async state(id: number) {
    const tab = await this.api.tabs.get(id);
    if (tab.type !== 'messageCompose') throw new Error('Open a message composer first.');
    const settings = await this.settings();
    const details = await this.api.compose.getComposeDetails(id);
    const context = await this.context(id, details, settings);
    const result = validate(details, context, settings);
    return { selected: context.selected, original: context.original, enabled: settings.enabled,
      levels: settings.allowedLevels, issues: result.issues };
  }
  async apply(id: number, level: unknown, confirmed = false) {
    return this.serialize(id, () => this.applyNow(id, level, confirmed));
  }
  private async applyNow(id: number, level: unknown, confirmed: boolean) {
    if (!(level === null || isTlpLevel(level))) throw new Error('Choose a valid TLP level.');
    if ((await this.api.tabs.get(id)).type !== 'messageCompose') throw new Error('Open a message composer first.');
    const settings = await this.settings();
    if (!settings.enabled) throw new Error('Enable TLP Mail Marker in Settings first.');
    if (level && !settings.allowedLevels.includes(level)) throw new Error('That classification is not permitted.');
    const details = await this.api.compose.getComposeDetails(id);
    const context = await this.context(id, details, settings);
    const from = context.original ?? context.selected;
    const warning = settings.warnOnDowngrade && from && (level === null || assessChange(from, level).isDowngrade);
    if (warning && !confirmed) return { needsConfirmation: true, advice: 'Wider sharing needs the original source’s permission. Confirm only if you are authorised.' };
    const current = await this.api.compose.getComposeDetails(id);
    await this.api.compose.setComposeDetails(id, markDetails(current, level, settings));
    await this.remember(id, { ...context, selected: level });
    return { needsConfirmation: false };
  }
  private async snapshot(id: number) {
    const settings = await this.settings();
    const current = await this.api.compose.getComposeDetails(id);
    const context = await this.context(id, current, settings);
    const attachments = await this.api.compose.listAttachments(id);
    return { settings, context, details: current, digest: await reviewDigest(current, context, settings, attachments) };
  }
  async beforeSend(tab: MailTab, _details: ComposeDetails): Promise<{ cancel: boolean }> {
    try {
      if (!(await this.settings()).enabled) return { cancel: false };
      await this.mutations.get(tab.id);
      const snapshot = await this.snapshot(tab.id);
      const result = validate(snapshot.details, snapshot.context, snapshot.settings);
      if (result.ok && !result.needsConfirmation) return { cancel: false };
      const token = crypto.randomUUID();
      const decision = new Promise<boolean>(resolve => {
        this.reviews.set(token, { tabId: tab.id, digest: snapshot.digest, issues: result.issues, canContinue: result.ok, resolve });
      });
      // windows.create waits for OS focus on some platforms. Do not make the
      // send decision wait for it: the review page can respond or close first.
      void this.api.windows.create({
        url: this.api.runtime.getURL(`review.html?token=${token}`), type: 'popup', width: 500, height: 560,
      }).then(async window => {
        const review = this.reviews.get(token);
        if (review) review.windowId = window.id;
        else await this.api.windows.remove(window.id).catch(() => undefined);
      }).catch(() => this.finish(token, false));
      const accepted = await decision;
      // Never carry permission to send into another attempt or changed message.
      return { cancel: !accepted || (await this.snapshot(tab.id)).digest !== snapshot.digest };
    } catch {
      await this.api.composeAction.setBadgeText({ tabId: tab.id, text: '!' }).catch(() => undefined);
      return { cancel: true };
    }
  }
  bindReview(token: string, windowId: number) {
    const review = this.reviews.get(token);
    if (review) review.windowId = windowId;
  }
  review(token: string) {
    const review = this.reviews.get(token);
    if (!review) throw new Error('This send review has expired. Return to the composer.');
    return { issues: review.issues, canContinue: review.canContinue };
  }
  async decide(token: string, proceed: boolean) {
    const review = this.reviews.get(token);
    if (!review) throw new Error('This send review has expired.');
    if (proceed && (!review.canContinue || (await this.snapshot(review.tabId)).digest !== review.digest)) {
      return { changed: true };
    }
    const windowId = review.windowId;
    this.finish(token, proceed);
    if (windowId != null) await this.api.windows.remove(windowId).catch(() => undefined);
    return { changed: false };
  }
  private finish(token: string, proceed: boolean) {
    const review = this.reviews.get(token);
    this.reviews.delete(token);
    review?.resolve(proceed);
  }
  windowClosed(id: number) {
    // An unbound review may have closed before windows.create resolves. Cancel
    // that attempt conservatively rather than leaving its composer locked.
    for (const [token, review] of this.reviews) if (review.windowId == null || review.windowId === id) this.finish(token, false);
  }
  async tabClosed(id: number) {
    for (const [token, review] of this.reviews) if (review.tabId === id) {
      const windowId = review.windowId;
      this.finish(token, false);
      if (windowId != null) await this.api.windows.remove(windowId).catch(() => undefined);
    }
    await this.mutations.get(id)?.catch(() => undefined);
    await this.api.storage.session.remove(this.key(id));
  }
}
