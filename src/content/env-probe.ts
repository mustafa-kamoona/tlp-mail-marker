/**
 * MAIN-world environment probe.
 *
 * Runs in the page's own JavaScript context solely to read a small, stable set
 * of public Roundcube environment values (compose mode / reply / forward /
 * draft ids) that are not reachable from the isolated world. It publishes them
 * as attributes on `<html>` and dispatches a `tlp-compose-env` event.
 *
 * It does NOT read or transmit email content, does not use eval, does not load
 * remote code, and performs no network access. The isolated content script
 * consumes only the published attributes.
 */

interface RcmailEnvLike {
  action?: string;
  compose_mode?: string;
  reply_uid?: string | number;
  forward_uid?: string | number;
  draft_id?: string | number;
  draft_uid?: string | number;
}

interface RcmailLike {
  env?: RcmailEnvLike;
}

const ATTRS: Array<[keyof RcmailEnvLike, string]> = [
  ['compose_mode', 'data-tlp-compose-mode'],
  ['reply_uid', 'data-tlp-reply-uid'],
  ['forward_uid', 'data-tlp-forward-uid'],
  ['draft_id', 'data-tlp-draft-id'],
  ['draft_uid', 'data-tlp-draft-uid'],
];

function publish(): boolean {
  const rcmail = (window as unknown as { rcmail?: RcmailLike }).rcmail;
  const env = rcmail?.env;
  const root = document.documentElement;
  if (!env || !root) {
    return false;
  }
  if (root.getAttribute('data-tlp-env-ready') === '1') {
    return true;
  }
  for (const [key, attr] of ATTRS) {
    const value = env[key];
    if (value !== undefined && value !== null && value !== '') {
      root.setAttribute(attr, String(value));
    }
  }
  root.setAttribute('data-tlp-env-ready', '1');
  document.dispatchEvent(new CustomEvent('tlp-compose-env'));
  return true;
}

function start(): void {
  if (publish()) {
    return;
  }
  let attempts = 0;
  const timer = setInterval(() => {
    if (publish() || ++attempts > 50) {
      clearInterval(timer);
    }
  }, 100);
}

start();
