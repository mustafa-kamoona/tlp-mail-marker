/**
 * Composer controller: the per-composer orchestrator.
 *
 * Responsibilities:
 *  - inject the accessible TLP selector;
 *  - detect and preserve existing classifications (replies/forwards/drafts);
 *  - apply idempotent subject/body markings on selection change;
 *  - validate synchronously at send time and block, warn, or allow.
 *
 * The controller is provider-agnostic: it talks only to {@link ComposerHandle}.
 * Nothing is stored and no network is used.
 */

import { analyzeSubject } from '../core/parser.js';
import { applySubjectMark, removeSubjectMark } from '../core/marking.js';
import {
  detectEffectiveClassification,
  intentFromDocument,
  isReplyOrForward,
  type ComposerIntent,
} from '../core/policy.js';
import type { Settings } from '../core/settings.js';
import { type TlpLevel, isDowngrade } from '../core/tlp.js';
import { validateBeforeSend, type ValidationIssue, type ValidationResult } from '../core/validation.js';
import type { ComposerHandle } from '../adapters/interface.js';
import { logger } from '../utils/logger.js';
import { t } from '../utils/i18n.js';
import { showAlert, showConfirm, type DialogItem } from './ui/dialog.js';
import { createSelector, type SelectorController } from './ui/selector.js';
import type { UiTheme } from './ui/styles.js';
import { isSendControl, nearestControl } from '../adapters/roundcube/selectors.js';

export interface ComposerControllerDeps {
  doc: Document;
  location: Location;
  composer: ComposerHandle;
  settings: Settings;
  theme: UiTheme;
}

interface BypassToken {
  command: string;
  expires: number;
}

export class ComposerController {
  private readonly doc: Document;
  private readonly location: Location;
  private readonly composer: ComposerHandle;
  private readonly settings: Settings;
  private readonly theme: UiTheme;

  private selector: SelectorController | null = null;
  private selected: TlpLevel | null = null;
  private originalLevel: TlpLevel | null = null;
  /** Level detected in the composer content when it opened (before any user change). */
  private detectedLevel: TlpLevel | null = null;

  private bypass: BypassToken | null = null;
  private readonly disposers: Array<() => void> = [];
  private destroyed = false;
  private evaluating = false;

  constructor(deps: ComposerControllerDeps) {
    this.doc = deps.doc;
    this.location = deps.location;
    this.composer = deps.composer;
    this.settings = deps.settings;
    this.theme = deps.theme;
  }

  private getIntent(): ComposerIntent {
    return intentFromDocument(this.doc, this.location.search);
  }

  init(): void {
    this.injectSelector();
    this.detectExisting();
    this.installEnvListener();
    this.installSendInterception();
    this.installModeObserver();
  }

  destroy(): void {
    this.destroyed = true;
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose();
      } catch (error) {
        logger.debug('disposer failed', error);
      }
    }
    this.selector?.destroy();
    this.selector = null;
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  private injectSelector(): void {
    const anchor = this.composer.uiAnchor();
    const host = this.createSelectorHost();
    if (anchor && anchor.parentElement) {
      anchor.insertAdjacentElement('afterend', host);
    } else if (this.composer.form) {
      this.composer.form.insertBefore(host, this.composer.form.firstChild);
    } else {
      this.doc.body.appendChild(host);
    }
  }

  private createSelectorHost(): HTMLElement {
    const selector = createSelector({
      doc: this.doc,
      theme: this.theme,
      colorCoding: this.settings.colorCoding,
      levels: this.settings.allowedLevels,
      onChange: (level) => this.onSelectionChange(level),
    });
    this.selector = selector;
    this.disposers.push(() => selector.destroy());
    return selector.host;
  }

  // ---------------------------------------------------------------------------
  // Detection / preselection
  // ---------------------------------------------------------------------------

  private detectExisting(): void {
    const subject = this.composer.subject?.value ?? '';
    const body = this.composer.body.readText();
    const detected = detectEffectiveClassification({ subject, body });
    this.detectedLevel = detected.level;

    if (isReplyOrForward(this.getIntent())) {
      this.originalLevel = detected.level;
    }

    if (detected.level) {
      if (this.settings.allowedLevels.includes(detected.level)) {
        this.selected = detected.level;
        this.selector?.setLevel(detected.level, { source: detected.source });
        this.applyFullMarking(detected.level);

        if (detected.source === 'body-leading' || detected.source === 'body-consensus') {
          this.selector?.setDetectedNote(t('detectedFromOriginal', { level: detected.level }));
        }
      } else {
        this.selector?.setWarning(
          t('warningOriginalNotAllowed', { level: detected.level }),
          'error',
        );
      }
    } else if (detected.conflicts.length > 0) {
      this.selector?.setWarning(
        t('warningConflicts', { levels: detected.conflicts.join(', ') }),
        'error',
      );
    } else if (this.getIntent() === 'new' && this.settings.defaultLevel) {
      this.selected = this.settings.defaultLevel;
      this.selector?.setLevel(this.settings.defaultLevel, { source: 'default' });
      this.applyFullMarking(this.settings.defaultLevel);
      this.selector?.setDetectedNote(
        t('detectedDefault', { level: this.settings.defaultLevel }),
      );
    }

    if (detected.legacyWhite) {
      this.selector?.setWarning(t('warningLegacyWhite'), 'warn');
    }
  }

  // ---------------------------------------------------------------------------
  // Selection changes
  // ---------------------------------------------------------------------------

  private onSelectionChange(level: TlpLevel | null): void {
    this.selected = level;
    this.selector?.setWarning(null);

    if (level == null) {
      this.removeMarking();
      return;
    }

    if (
      this.originalLevel &&
      this.settings.warnOnDowngrade &&
      isDowngrade(this.originalLevel, level)
    ) {
      this.selector?.setWarning(
        t('warningDowngrade', { from: this.originalLevel, to: level }),
        'warn',
      );
    }

    this.applyFullMarking(level);
  }

  private applyFullMarking(level: TlpLevel): void {
    if (this.settings.markSubject) {
      this.writeSubject(applySubjectMark(this.composer.subject?.value ?? '', level));
    }
    if (this.settings.markBody) {
      this.composer.body.apply(level, { colorCoding: this.settings.colorCoding });
    }
  }

  private removeMarking(): void {
    if (this.settings.markSubject) {
      this.writeSubject(removeSubjectMark(this.composer.subject?.value ?? ''));
    }
    this.composer.body.remove();
  }

  /**
   * Ensure any marking the user expects is committed to the editor model, but
   * never overwrite a conflicting marking the user typed by hand — that is left
   * for validation to surface.
   */
  private syncMarkings(): void {
    const level = this.selected;
    if (!level) {
      return;
    }
    if (this.settings.markSubject && this.composer.subject) {
      const analysis = analyzeSubject(this.composer.subject.value);
      if (analysis.level == null || analysis.level === level) {
        this.writeSubject(applySubjectMark(this.composer.subject.value, level));
      }
    }
    if (this.settings.markBody) {
      const leading = this.composer.body.leadingLevel();
      if (leading == null || leading === level) {
        this.composer.body.apply(level, { colorCoding: this.settings.colorCoding });
      }
    }
  }

  private writeSubject(value: string): void {
    const subject = this.composer.subject;
    if (!subject || subject.value === value) {
      return;
    }
    subject.value = value;
    const win = this.doc.defaultView ?? window;
    subject.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
    subject.dispatchEvent(new win.Event('change', { bubbles: true }));
  }

  // ---------------------------------------------------------------------------
  // MAIN-world environment bridge
  // ---------------------------------------------------------------------------

  /**
   * The MAIN-world probe publishes the Roundcube compose mode as a DOM
   * attribute. If it arrives after composer init, adopt the original level from
   * the already-detected classification.
   */
  private installEnvListener(): void {
    const handler = (): void => this.onEnvReady();
    this.doc.addEventListener('tlp-compose-env', handler);
    this.disposers.push(() => this.doc.removeEventListener('tlp-compose-env', handler));
    this.onEnvReady();
  }

  private onEnvReady(): void {
    if (this.destroyed || this.originalLevel != null || this.detectedLevel == null) {
      return;
    }
    if (!isReplyOrForward(this.getIntent())) {
      return;
    }
    // Use the level detected at open, not the current selection: the user may
    // already have changed it, and the downgrade baseline must be the original.
    this.originalLevel = this.detectedLevel;
    if (this.selected === this.detectedLevel) {
      this.selector?.setDetectedNote(t('detectedFromOriginal', { level: this.detectedLevel }));
    }
  }

  // ---------------------------------------------------------------------------
  // Mode changes (HTML <-> plain, editor initialisation)
  // ---------------------------------------------------------------------------

  private installModeObserver(): void {
    const dispose = this.composer.observe(() => {
      if (this.destroyed) {
        return;
      }
      // Re-normalise the marking into the (new) editor. Idempotent.
      if (this.selected) {
        this.syncMarkings();
      }
    });
    this.disposers.push(dispose);
  }

  // ---------------------------------------------------------------------------
  // Send interception
  // ---------------------------------------------------------------------------

  private installSendInterception(): void {
    const onClick = (event: Event): void => {
      if (this.destroyed) {
        return;
      }
      const control = nearestControl(event.target, this.doc);
      if (!control || !isSendControl(control)) {
        return;
      }
      if (this.isBypassed('send')) {
        return;
      }
      const decision = this.evaluateSend();
      if (decision.allow) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      void this.resolveBlockedSend(control, decision);
    };
    this.doc.addEventListener('click', onClick, true);
    this.disposers.push(() => this.doc.removeEventListener('click', onClick, true));

    const form = this.composer.form;
    if (form) {
      const onSubmit = (event: Event): void => {
        if (this.destroyed || this.isBypassed('send')) {
          return;
        }
        const decision = this.evaluateSend();
        if (!decision.allow) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void this.resolveBlockedSend(null, decision);
        }
      };
      form.addEventListener('submit', onSubmit, true);
      this.disposers.push(() => form.removeEventListener('submit', onSubmit, true));
    }
  }

  private localizeIssue(issue: ValidationIssue): string {
    return t(`issue_${issue.code}`, issue.params);
  }

  private async resolveBlockedSend(
    control: HTMLElement | null,
    decision: { allow: boolean; block?: ValidationResult; confirm?: ValidationResult },
  ): Promise<void> {
    if (decision.block) {
      const errors: DialogItem[] = decision.block.errors.map((issue) => ({
        text: this.localizeIssue(issue),
        tone: 'error',
      }));
      await showAlert(this.doc, this.theme, {
        title: t('blockTitle'),
        subtitle: t('blockSubtitle'),
        message: t('blockMessage'),
        items: errors,
        icon: 'shield',
        tone: 'error',
        okText: t('blockAction'),
      });
      // Draw attention to where the fix is.
      this.selector?.setError(true);
      this.selector?.focus();
      return;
    }
    if (decision.confirm) {
      const warnings = decision.confirm.warnings;
      const isDowngrade = warnings.some((issue) => issue.code === 'DOWNGRADE');
      const ok = await showConfirm(this.doc, this.theme, {
        title: isDowngrade ? t('confirmDowngradeTitle') : t('confirmTitle'),
        subtitle: isDowngrade ? t('confirmDowngradeSubtitle') : undefined,
        message: isDowngrade ? undefined : t('confirmMessage'),
        items: warnings.map((issue) => ({
          text: this.localizeIssue(issue),
          tone: issue.code === 'DOWNGRADE' || issue.code === 'QUOTED_HIGHER' ? 'error' : 'warn',
        })),
        icon: 'warn',
        tone: 'warn',
        confirmText: t('confirmSend'),
        cancelText: t('confirmBack'),
      });
      if (ok && control) {
        this.selector?.setError(false);
        this.armBypass('send');
        this.doc.defaultView?.setTimeout(() => control.click(), 0);
      } else {
        this.selector?.focus();
      }
    }
  }

  private evaluateSend(): {
    allow: boolean;
    block?: ValidationResult;
    confirm?: ValidationResult;
  } {
    if (this.evaluating) {
      return { allow: true };
    }
    this.evaluating = true;
    try {
      this.syncMarkings();
      const result = validateBeforeSend({
        selectedLevel: this.selected,
        subject: this.composer.subject?.value ?? '',
        bodyText: this.composer.body.readText(),
        intent: this.getIntent(),
        originalLevel: this.originalLevel,
        settings: this.settings,
      });
      if (!result.ok) {
        return { allow: false, block: result };
      }
      if (result.needsConfirmation) {
        return { allow: false, confirm: result };
      }
      return { allow: true };
    } finally {
      this.evaluating = false;
    }
  }

  private isBypassed(command: string): boolean {
    if (!this.bypass) {
      return false;
    }
    if (Date.now() > this.bypass.expires) {
      this.bypass = null;
      return false;
    }
    return this.bypass.command === command;
  }

  private armBypass(command: string): void {
    this.bypass = { command, expires: Date.now() + 2500 };
  }

  // ---------------------------------------------------------------------------
  // Introspection (used by tests)
  // ---------------------------------------------------------------------------

  getSelectedLevel(): TlpLevel | null {
    return this.selected;
  }

  getOriginalLevel(): TlpLevel | null {
    return this.originalLevel;
  }
}
