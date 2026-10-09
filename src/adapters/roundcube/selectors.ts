/**
 * Roundcube DOM selectors and control detection.
 *
 * Targets the stable composer contract (`#composebody`, `_subject`, a
 * surrounding form) rather than skin-specific markup. Verified against
 * Roundcube 1.6.x Elastic skin.
 */

import { logger } from '../../utils/logger.js';

export const SUBJECT_SELECTOR = '#compose-subject, [name="_subject"]';
export const BODY_TEXTAREA_SELECTOR = '#composebody, textarea[name="_message"]';
export const COMPOSE_BODY_CONTAINER_SELECTOR = '#composebodycontainer';
export const COMPOSE_ROOT_SELECTOR = '#compose-content, #layout-content';

const EDITOR_IFRAME_SELECTORS = [
  'iframe.tox-edit-area__iframe',
  '.tox-edit-area iframe',
  'iframe[id$="_ifr"]',
  '.mce-edit-area iframe',
];

export function findTextarea(doc: Document): HTMLTextAreaElement | null {
  return doc.querySelector<HTMLTextAreaElement>(BODY_TEXTAREA_SELECTOR);
}

export function findSubject(doc: Document): HTMLInputElement | HTMLTextAreaElement | null {
  const el = doc.querySelector<HTMLInputElement | HTMLTextAreaElement>(SUBJECT_SELECTOR);
  if (!el) {
    return null;
  }
  return el;
}

function bodyScope(doc: Document): ParentNode {
  const container = doc.querySelector(COMPOSE_BODY_CONTAINER_SELECTOR);
  if (container) {
    return container;
  }
  const textarea = findTextarea(doc);
  return textarea?.parentElement ?? doc;
}

export interface EditorBody {
  readonly doc: Document;
  readonly body: HTMLElement;
}

/**
 * Locate the live rich-text editor body, if a TinyMCE-style editor is active.
 * Cross-frame access is same-origin and guarded.
 *
 * Detection is deliberately tolerant: it recognises the common TinyMCE iframe
 * wrappers and, as a fallback, a `contenteditable` region within the composer
 * body container (some editors/skins put the editable region directly in the
 * document). This mirrors the generic editable detection used by other webmail
 * extensions, implemented independently here.
 */
export function findEditorBody(doc: Document): EditorBody | null {
  const scope = bodyScope(doc);
  for (const selector of EDITOR_IFRAME_SELECTORS) {
    const iframe = scope.querySelector<HTMLIFrameElement>(selector);
    if (!iframe) {
      continue;
    }
    try {
      const frameDoc = iframe.contentDocument;
      const body = frameDoc?.body;
      if (frameDoc && body) {
        return { doc: frameDoc, body };
      }
    } catch (error) {
      logger.debug('editor iframe not accessible', error);
    }
  }

  const editable = scope.querySelector<HTMLElement>('[contenteditable="true"]');
  if (editable && editable !== doc.body) {
    return { doc: editable.ownerDocument, body: editable };
  }

  return null;
}

const COMMAND_RE = /rcmail\s*\.\s*command\s*\(\s*['"]([a-z0-9-]+)['"]/i;

/** Extract the Roundcube command name a control invokes, if any. */
export function commandForElement(element: Element | null): string | null {
  let node: Element | null = element;
  while (node) {
    const onclick = node.getAttribute?.('onclick') ?? '';
    const match = COMMAND_RE.exec(onclick);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
    if (node.getAttribute?.('data-command')) {
      return (node.getAttribute('data-command') as string).toLowerCase();
    }
    node = node.parentElement;
  }
  return null;
}

/** The nearest clickable control (link, button or input) for an event target. */
export function nearestControl(target: EventTarget | null, _doc: Document): HTMLElement | null {
  // Duck-typed rather than `instanceof Element`: event targets may originate
  // from a different realm (e.g. an iframe) where instanceof would fail.
  const candidate = target as Element | null;
  if (!candidate || typeof candidate.closest !== 'function') {
    return null;
  }
  const control = candidate.closest<HTMLElement>('a, button, input, [role="button"]');
  return control ?? null;
}

function hasClassLike(element: Element, patterns: string[]): boolean {
  return patterns.some((p) => element.matches(p));
}

export function isSendControl(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  if (commandForElement(element) === 'send') {
    return true;
  }
  return hasClassLike(element, ['.send', '[data-tlp-send]']);
}

export function isSaveDraftControl(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  const command = commandForElement(element);
  if (command === 'savedraft') {
    return true;
  }
  return hasClassLike(element, ['.save.draft', '.savedraft', '[data-tlp-savedraft]']);
}

/** All send/save controls, scoped to the composer form when available. */
export function findControls(doc: Document, form: HTMLFormElement | null): HTMLElement[] {
  const scope: ParentNode = form ?? doc;
  return Array.from(scope.querySelectorAll<HTMLElement>('a, button, input')).filter(
    (element) => isSendControl(element) || isSaveDraftControl(element),
  );
}

export function findComposerControl(doc: Document, form: HTMLFormElement | null, kind: 'send' | 'savedraft'): HTMLElement | null {
  return findControls(doc, form).find((element) =>
    kind === 'send' ? isSendControl(element) : isSaveDraftControl(element),
  ) ?? null;
}
