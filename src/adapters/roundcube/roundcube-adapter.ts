/** Roundcube Webmail provider adapter. */

import { intentFromDocument, isReplyOrForward, type ComposerIntent } from '../../core/policy.js';
import type { BodyHandle, ComposerHandle, ProviderAdapter } from '../interface.js';
import { RoundcubeBody } from './body.js';
import {
  findControls,
  findEditorBody,
  findSubject,
  findTextarea,
  isSaveDraftControl,
  isSendControl,
} from './selectors.js';

export const ROUNDCUBE_ADAPTER_ID = 'roundcube';

class RoundcubeComposer implements ComposerHandle {
  readonly adapterId = ROUNDCUBE_ADAPTER_ID;
  readonly body: BodyHandle;
  readonly subject: HTMLInputElement | HTMLTextAreaElement | null;
  readonly form: HTMLFormElement | null;
  private readonly intent: ComposerIntent;

  constructor(
    private readonly doc: Document,
    location: Location,
  ) {
    this.subject = findSubject(doc);
    const textarea = findTextarea(doc);
    this.form = (this.subject?.form ?? textarea?.form ?? null) as HTMLFormElement | null;
    this.body = new RoundcubeBody(doc);
    this.intent = intentFromDocument(doc, location.search);
  }

  isHtml(): boolean {
    return this.body.mode() === 'html';
  }

  isReplyOrForward(): boolean {
    return isReplyOrForward(this.intent);
  }

  sendControls(): HTMLElement[] {
    return findControls(this.doc, this.form).filter((element) => isSendControl(element));
  }

  saveDraftControls(): HTMLElement[] {
    return findControls(this.doc, this.form).filter((element) => isSaveDraftControl(element));
  }

  uiAnchor(): HTMLElement | null {
    return (
      this.doc.querySelector<HTMLElement>('#compose_subject') ??
      (this.subject?.closest<HTMLElement>('.form-group') ?? this.subject?.parentElement ?? null)
    );
  }

  observe(callback: () => void): () => void {
    let lastMode: 'html' | 'plain' = this.body.mode();
    let lastEditor = findEditorBody(this.doc)?.body ?? null;

    const observer = new MutationObserver(() => {
      const editor = findEditorBody(this.doc)?.body ?? null;
      const mode: 'html' | 'plain' = editor ? 'html' : 'plain';
      if (mode !== lastMode || (editor && editor !== lastEditor)) {
        lastMode = mode;
        lastEditor = editor;
        callback();
      }
    });

    observer.observe(this.doc.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }
}

export class RoundcubeAdapter implements ProviderAdapter {
  readonly id = ROUNDCUBE_ADAPTER_ID;
  readonly displayName = 'Roundcube Webmail';

  supports(doc: Document, _location: Location): boolean {
    try {
      return findTextarea(doc) !== null && findSubject(doc) !== null;
    } catch {
      return false;
    }
  }

  findComposer(doc: Document, location: Location): ComposerHandle | null {
    if (!this.supports(doc, location)) {
      return null;
    }
    return new RoundcubeComposer(doc, location);
  }
}
