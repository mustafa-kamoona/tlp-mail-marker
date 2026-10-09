/**
 * Provider adapter contract.
 *
 * The TLP engine (src/core) is provider-agnostic. Everything that depends on a
 * particular webmail's DOM lives behind this interface, so new providers can be
 * added without touching the core. Only Roundcube is implemented in this
 * release.
 */

import type { TlpLevel } from '../core/tlp.js';

export interface MarkingOptions {
  colorCoding: boolean;
}

/** Read/write access to the message body, abstracting HTML vs plain text. */
export interface BodyHandle {
  /** `html` when a rich-text editor is active, otherwise `plain`. */
  mode(): 'html' | 'plain';
  /** Plain-text rendering of the body, for analysis and validation. */
  readText(): string;
  /** Leading TLP marker currently present, if any. */
  leadingLevel(): TlpLevel | null;
  /** Apply a marking. Must be idempotent. */
  apply(level: TlpLevel, options: MarkingOptions): void;
  /** Remove any marking managed or adopted by the extension. */
  remove(): void;
}

export interface ComposerHandle {
  readonly adapterId: string;
  readonly form: HTMLFormElement | null;
  readonly subject: HTMLInputElement | HTMLTextAreaElement | null;
  readonly body: BodyHandle;
  /** True when the rich-text editor is active. */
  isHtml(): boolean;
  /** True when the composer was opened from a reply/reply-all/forward. */
  isReplyOrForward(): boolean;
  /** Candidate send controls within the composer. */
  sendControls(): HTMLElement[];
  /** Candidate save-draft controls. */
  saveDraftControls(): HTMLElement[];
  /** Element after which the extension's selector UI should be inserted. */
  uiAnchor(): HTMLElement | null;
  /**
   * Observe composer mutations (editor initialisation, HTML/plain switches).
   * Returns a disposer.
   */
  observe(callback: () => void): () => void;
}

export interface ProviderAdapter {
  readonly id: string;
  readonly displayName: string;
  /** Cheap presence check; must not throw. */
  supports(doc: Document, location: Location): boolean;
  /** Locate the active composer, or null when none is present. */
  findComposer(doc: Document, location: Location): ComposerHandle | null;
}
