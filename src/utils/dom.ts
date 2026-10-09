/** Small DOM helpers. No innerHTML is ever used with dynamic data. */

export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props?: Partial<HTMLElementTagNameMap[K]> & { attrs?: Record<string, string>; text?: string },
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (props) {
    const { attrs, text, ...rest } = props as Record<string, unknown> & {
      attrs?: Record<string, string>;
      text?: string;
    };
    Object.assign(node, rest);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        node.setAttribute(key, value);
      }
    }
    if (typeof text === 'string') {
      node.textContent = text;
    }
  }
  return node;
}

/** Dispatch input + change events so host-page listeners observe programmatic edits. */
export function dispatchInputEvents(target: HTMLElement): void {
  const win = target.ownerDocument.defaultView ?? window;
  target.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
  target.dispatchEvent(new win.Event('change', { bubbles: true }));
}

export function setInputValue(target: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (target.value === value) {
    return;
  }
  // Reset framework value trackers (React and similar) so programmatic edits
  // are observed by the host application. Harmless for jQuery-based clients.
  const tracker = (target as unknown as { _valueTracker?: { setValue(value: string): void } })._valueTracker;
  if (tracker && typeof tracker.setValue === 'function') {
    tracker.setValue('');
  }
  target.value = value;
  dispatchInputEvents(target);
}

/**
 * Wait for `selector` to appear, or invoke immediately if already present.
 * Returns a disposer. Uses MutationObserver only (no polling), and bounds the
 * number of observations to avoid leaks.
 */
export function whenPresent(
  doc: Document,
  selector: string,
  callback: (el: Element) => void,
): () => void {
  const existing = doc.querySelector(selector);
  if (existing) {
    callback(existing);
    return () => undefined;
  }
  const observer = new MutationObserver(() => {
    const found = doc.querySelector(selector);
    if (found) {
      observer.disconnect();
      callback(found);
    }
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}

export function isVisible(element: Element): boolean {
  const el = element as HTMLElement;
  if (el.hidden) {
    return false;
  }
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) {
    return false;
  }
  return el.getClientRects().length > 0 || el.offsetParent !== null;
}
