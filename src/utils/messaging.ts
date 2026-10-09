/**
 * Typed extension messaging.
 *
 * Content scripts run only on authorised origins and do not need privileged
 * actions, so messaging is limited to reconciling dynamic content-script
 * registration after the options page or popup changes the domain list.
 */

export const MSG_RECONCILE = 'tlp:reconcile' as const;

export type ExtensionMessage = { type: typeof MSG_RECONCILE; reason?: string };

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === MSG_RECONCILE
  );
}

/** Fire-and-forget notification to the service worker. Never throws. */
export function notifyReconcile(reason: string): void {
  try {
    const message: ExtensionMessage = { type: MSG_RECONCILE, reason };
    void chrome.runtime.sendMessage(message).catch(() => undefined);
  } catch {
    // No receiver (e.g. during tests) — ignore.
  }
}
