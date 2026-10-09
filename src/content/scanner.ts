/**
 * Composer scanner.
 *
 * Rather than detecting a composer exactly once at content-script load, the
 * scanner re-evaluates the document on a debounced MutationObserver (plus
 * user clicks), so it copes with composers that appear late, editors that are
 * initialised asynchronously, and DOM that is re-rendered. An element flag
 * prevents attaching twice.
 *
 * This idea is borrowed from the general approach used by Mailvelope's
 * content-script DOM scan (`scanDOM`), reimplemented independently for TLP
 * Mail Marker.
 */

import { detectComposer } from '../adapters/registry.js';
import type { ComposerHandle } from '../adapters/interface.js';

export const ATTACHED_ATTR = 'data-tlp-attached';

export interface ControllerLike {
  init(): void;
  destroy(): void;
}

export interface ScannerDeps {
  doc: Document;
  location: Location;
  /** Whether the extension should act on this document right now. */
  isAuthorized: () => boolean;
  /** Create (but do not init) a controller for a detected composer. */
  createController: (composer: ComposerHandle) => ControllerLike;
  /** Debounce for mutation-driven rescans, in milliseconds. */
  debounceMs?: number;
}

export interface ComposerScanner {
  start(): void;
  stop(): void;
  /** Run a scan immediately. */
  scan(): void;
  /** Detach and re-evaluate (used when settings change). */
  refresh(): void;
  isAttached(): boolean;
}

function attachmentAnchor(composer: ComposerHandle): HTMLElement | null {
  return (composer.form as HTMLElement | null) ?? composer.uiAnchor();
}

export function createComposerScanner(deps: ScannerDeps): ComposerScanner {
  const { doc, location, isAuthorized, createController } = deps;
  const debounceMs = deps.debounceMs ?? 400;

  let controller: ControllerLike | null = null;
  let observer: MutationObserver | null = null;
  let timer: number | null = null;

  const clearTimer = (): void => {
    if (timer !== null) {
      doc.defaultView?.clearTimeout(timer);
      timer = null;
    }
  };

  const detach = (): void => {
    if (controller) {
      controller.destroy();
      controller = null;
    }
    // Clear any stale attachment flags (does not trigger the observer, which
    // only watches childList).
    doc.querySelectorAll(`[${ATTACHED_ATTR}]`).forEach((el) => el.removeAttribute(ATTACHED_ATTR));
  };

  const scan = (): void => {
    if (!isAuthorized()) {
      detach();
      return;
    }
    let detected;
    try {
      detected = detectComposer(doc, location);
    } catch {
      detach();
      return;
    }
    if (!detected) {
      detach();
      return;
    }
    const anchor = attachmentAnchor(detected.composer);
    if (controller && anchor && anchor.getAttribute(ATTACHED_ATTR) === '1') {
      return; // already attached to this composer
    }
    detach();
    if (anchor) {
      anchor.setAttribute(ATTACHED_ATTR, '1');
    }
    controller = createController(detected.composer);
    controller.init();
  };

  const schedule = (): void => {
    clearTimer();
    const win = doc.defaultView;
    if (!win) {
      scan();
      return;
    }
    timer = win.setTimeout(() => {
      timer = null;
      scan();
    }, debounceMs);
  };

  const start = (): void => {
    scan();
    observer = new MutationObserver(schedule);
    const target = doc.body ?? doc.documentElement;
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }
    doc.addEventListener('click', schedule, true);
  };

  const stop = (): void => {
    clearTimer();
    observer?.disconnect();
    observer = null;
    doc.removeEventListener('click', schedule, true);
    detach();
  };

  return {
    start,
    stop,
    scan,
    refresh: () => {
      detach();
      scan();
    },
    isAttached: () => controller !== null,
  };
}
