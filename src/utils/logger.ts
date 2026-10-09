/**
 * Minimal, opt-in debug logging.
 *
 * There is no telemetry and nothing is ever sent anywhere. Logging is disabled
 * by default and can be enabled per session by setting `window.__TLP_DEBUG__`
 * (content scripts) before the extension loads, or via the options page for
 * development builds.
 */

const PREFIX = '[TLP Mail Marker]';

let debugEnabled = false;

export function setDebugEnabled(value: boolean): void {
  debugEnabled = value;
}

export function isDebugEnabled(): boolean {
  return debugEnabled;
}

/* eslint-disable no-console */
export const logger = {
  debug(...args: unknown[]): void {
    if (debugEnabled) {
      console.debug(PREFIX, ...args);
    }
  },
  info(...args: unknown[]): void {
    if (debugEnabled) {
      console.info(PREFIX, ...args);
    }
  },
  warn(...args: unknown[]): void {
    console.warn(PREFIX, ...args);
  },
  error(...args: unknown[]): void {
    console.error(PREFIX, ...args);
  },
};
/* eslint-enable no-console */
