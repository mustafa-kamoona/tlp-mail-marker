/**
 * Shadow-DOM stylesheet for the injected UI.
 *
 * Rendered inside a shadow root so page CSS cannot break the UI and the UI
 * cannot leak styles into the webmail client. Nothing here is loaded remotely.
 *
 * The dialog deliberately follows the Bootstrap visual language used by
 * Roundcube's Elastic skin (surface, border, spacing, button variants) so the
 * overlay looks native rather than bolted on. Design ideas were informed by
 * studying how established webmail extensions present modal editors/warnings
 * (e.g. Mailvelope's Bootstrap-styled modal), reimplemented here from scratch.
 */

export const UI_CSS = `
:host {
  all: initial;
  display: block;
  contain: content;
}

/* ---- Design tokens (light) ---- */
:host {
  --tlp-surface: #ffffff;
  --tlp-fg: #212529;
  --tlp-muted: #6c757d;
  --tlp-border: #dee2e6;
  --tlp-chip: #f1f3f5;
  --tlp-primary: #0d6efd;
  --tlp-primary-hover: #0b5ed7;
  --tlp-danger: #dc3545;
  --tlp-danger-hover: #bb2d3b;
  --tlp-warn: #b45309;
  --tlp-warn-bg: #fff4e5;
  --tlp-error-bg: #fdeaec;
  --tlp-info-bg: #e7f1ff;
  --tlp-overlay: rgba(20, 24, 30, 0.5);
  --tlp-shadow: 0 18px 50px rgba(16, 24, 40, 0.28), 0 2px 8px rgba(16, 24, 40, 0.16);
  color: var(--tlp-fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  box-sizing: border-box;
}

/* ---- Design tokens (dark) ---- */
:host(.tlp-dark) {
  --tlp-surface: #1b1f24;
  --tlp-fg: #e6edf3;
  --tlp-muted: #9aa4ae;
  --tlp-border: #343b42;
  --tlp-chip: #242a30;
  --tlp-primary: #4d9bff;
  --tlp-primary-hover: #60a5fa;
  --tlp-danger: #f85149;
  --tlp-danger-hover: #ff6b64;
  --tlp-warn: #e3b341;
  --tlp-warn-bg: #33280d;
  --tlp-error-bg: #3a1d20;
  --tlp-info-bg: #14263f;
  --tlp-overlay: rgba(0, 0, 0, 0.6);
  --tlp-shadow: 0 18px 50px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.4);
}

@media (prefers-color-scheme: dark) {
  :host(.tlp-theme-auto) {
    --tlp-surface: #1b1f24;
    --tlp-fg: #e6edf3;
    --tlp-muted: #9aa4ae;
    --tlp-border: #343b42;
    --tlp-chip: #242a30;
    --tlp-primary: #4d9bff;
    --tlp-primary-hover: #60a5fa;
    --tlp-danger: #f85149;
    --tlp-danger-hover: #ff6b64;
    --tlp-warn: #e3b341;
    --tlp-warn-bg: #33280d;
    --tlp-error-bg: #3a1d20;
    --tlp-info-bg: #14263f;
    --tlp-overlay: rgba(0, 0, 0, 0.6);
    --tlp-shadow: 0 18px 50px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.4);
  }
}

.tlp-root *, .tlp-root *::before, .tlp-root *::after,
[class^="tlp-"] *, [class^="tlp-"] *::before, [class^="tlp-"] *::after { box-sizing: border-box; }

/* =========================================================================
   Selector
   ========================================================================= */

.tlp-root {
  background: transparent;
  box-sizing: border-box;
}

.tlp-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.tlp-title { font-weight: 600; letter-spacing: 0.01em; color: var(--tlp-fg); }
.tlp-hint { color: var(--tlp-muted); font-size: 12px; }

.tlp-group {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 3px;
  background: var(--tlp-chip);
  border: 1px solid var(--tlp-border);
  border-radius: 8px;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}
.tlp-root[data-error="true"] .tlp-group {
  border-color: var(--tlp-danger);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tlp-danger) 22%, transparent);
}

.tlp-opt { position: relative; display: inline-flex; align-items: center; }
.tlp-opt input {
  position: absolute;
  opacity: 0;
  width: 1px; height: 1px;
  margin: 0;
}
.tlp-opt .tlp-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  color: var(--tlp-fg);
  font-size: 13px;
}
.tlp-opt .tlp-pill:hover { background: color-mix(in srgb, var(--tlp-fg) 7%, transparent); }
.tlp-opt input:checked + .tlp-pill {
  background: var(--tlp-surface);
  border-color: var(--tlp-primary);
  box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 0 0 1px var(--tlp-primary) inset;
  font-weight: 600;
}
.tlp-opt input:focus-visible + .tlp-pill {
  outline: 2px solid var(--tlp-primary);
  outline-offset: 2px;
}
.tlp-opt input:disabled + .tlp-pill { opacity: 0.5; cursor: not-allowed; }
.tlp-dot {
  width: 11px; height: 11px; border-radius: 50%;
  border: 1px solid rgba(0,0,0,0.35);
  flex: 0 0 auto;
}
.tlp-dot[data-level="TLP:RED"] { background: #FF2B2B; }
.tlp-dot[data-level="TLP:AMBER"] { background: #FFC000; }
.tlp-dot[data-level="TLP:AMBER+STRICT"] { background: #FFC000; box-shadow: inset 0 0 0 2px #000; }
.tlp-dot[data-level="TLP:GREEN"] { background: #33FF00; }
.tlp-dot[data-level="TLP:CLEAR"] { background: #FFFFFF; }

.tlp-actions { margin-top: 7px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tlp-desc { color: var(--tlp-muted); font-size: 12px; flex: 1 1 240px; min-width: 160px; }
.tlp-clear {
  background: none; border: none; padding: 0;
  color: var(--tlp-primary); cursor: pointer; font: inherit; font-size: 12px;
  text-decoration: underline;
}
.tlp-clear:focus-visible { outline: 2px solid var(--tlp-primary); outline-offset: 2px; }

.tlp-warning {
  margin-top: 6px;
  color: var(--tlp-warn);
  font-size: 12px;
  max-width: 62ch;
}
.tlp-warning[data-tone="error"] { color: var(--tlp-danger); }
.tlp-warning:empty { display: none; }

/* =========================================================================
   Modal dialog
   ========================================================================= */

.tlp-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  background: var(--tlp-overlay);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: tlp-fade 0.15s ease-out;
}

.tlp-dialog {
  background: var(--tlp-surface);
  color: var(--tlp-fg);
  border: 1px solid var(--tlp-border);
  border-radius: 14px;
  width: 100%;
  max-width: 540px;
  max-height: calc(100vh - 48px);
  overflow: auto;
  box-shadow: var(--tlp-shadow);
  animation: tlp-pop 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.tlp-dialog-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 20px 20px 0;
}
.tlp-dialog-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border-radius: 10px;
  display: grid;
  place-items: center;
}
.tlp-dialog-icon[data-tone="error"] { background: var(--tlp-error-bg); color: var(--tlp-danger); }
.tlp-dialog-icon[data-tone="warn"] { background: var(--tlp-warn-bg); color: var(--tlp-warn); }
.tlp-dialog-icon[data-tone="info"] { background: var(--tlp-info-bg); color: var(--tlp-primary); }
.tlp-dialog-titles { flex: 1 1 auto; min-width: 0; padding-top: 1px; }
.tlp-dialog h2 { margin: 0; font-size: 17px; font-weight: 650; line-height: 1.3; letter-spacing: -0.01em; }
.tlp-dialog .tlp-subtitle { margin: 3px 0 0; font-size: 13px; color: var(--tlp-muted); }

.tlp-close {
  all: unset;
  flex: 0 0 auto;
  width: 32px; height: 32px;
  border-radius: 8px;
  display: grid; place-items: center;
  color: var(--tlp-muted);
  cursor: pointer;
}
.tlp-close:hover { background: var(--tlp-chip); color: var(--tlp-fg); }
.tlp-close:focus-visible { outline: 2px solid var(--tlp-primary); outline-offset: 2px; }

.tlp-dialog-body { padding: 14px 20px 4px; }
.tlp-dialog-body > p { margin: 0 0 12px; font-size: 14px; }
.tlp-dialog-body > p:last-child { margin-bottom: 0; }

.tlp-issues { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.tlp-issues li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  font-size: 13.5px;
  line-height: 1.45;
  background: var(--tlp-chip);
  border: 1px solid var(--tlp-border);
  border-radius: 9px;
}
.tlp-issues li[data-tone="error"] { border-color: color-mix(in srgb, var(--tlp-danger) 45%, var(--tlp-border)); }
.tlp-issues li[data-tone="warn"] { border-color: color-mix(in srgb, var(--tlp-warn) 45%, var(--tlp-border)); }
.tlp-issues .tlp-issue-icon { flex: 0 0 auto; margin-top: 1px; color: var(--tlp-muted); }
.tlp-issues li[data-tone="error"] .tlp-issue-icon { color: var(--tlp-danger); }
.tlp-issues li[data-tone="warn"] .tlp-issue-icon { color: var(--tlp-warn); }

.tlp-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px 18px;
  flex-wrap: wrap;
}

.tlp-btn {
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  border-radius: 8px;
  padding: 9px 16px;
  cursor: pointer;
  border: 1px solid transparent;
  white-space: nowrap;
}
.tlp-btn[data-variant="primary"] { background: var(--tlp-primary); color: #fff; }
.tlp-btn[data-variant="primary"]:hover { background: var(--tlp-primary-hover); }
.tlp-btn[data-variant="secondary"] { background: var(--tlp-surface); color: var(--tlp-fg); border-color: var(--tlp-border); }
.tlp-btn[data-variant="secondary"]:hover { background: var(--tlp-chip); }
.tlp-btn[data-variant="danger"] { background: var(--tlp-danger); color: #fff; }
.tlp-btn[data-variant="danger"]:hover { background: var(--tlp-danger-hover); }
.tlp-btn:focus-visible { outline: 2px solid var(--tlp-primary); outline-offset: 2px; }

@media (max-width: 480px) {
  .tlp-dialog-foot { flex-direction: column-reverse; }
  .tlp-dialog-foot .tlp-btn { width: 100%; }
}

@keyframes tlp-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes tlp-pop {
  from { opacity: 0; transform: translateY(6px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .tlp-backdrop, .tlp-dialog { animation: none; }
}

/* =========================================================================
   Toast
   ========================================================================= */

.tlp-toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483645;
  max-width: 360px;
  background: var(--tlp-surface);
  color: var(--tlp-fg);
  border: 1px solid var(--tlp-border);
  border-left: 4px solid var(--tlp-primary);
  border-radius: 10px;
  padding: 11px 14px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
  box-shadow: var(--tlp-shadow);
  animation: tlp-pop 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
}
`;

/** Themes supported by the user preference. */
export type UiTheme = 'auto' | 'light' | 'dark';

export function themeClass(theme: UiTheme): string {
  if (theme === 'dark') {
    return 'tlp-theme-dark tlp-dark';
  }
  if (theme === 'light') {
    return 'tlp-theme-light';
  }
  return 'tlp-theme-auto';
}

/** Create a shadow host with the shared stylesheet attached. */
export function createShadowHost(doc: Document, theme: UiTheme): { host: HTMLElement; root: ShadowRoot } {
  const host = doc.createElement('div');
  host.className = `tlp-mail-marker-ui ${themeClass(theme)}`;
  host.style.display = 'block';
  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = UI_CSS;
  root.appendChild(style);
  return { host, root };
}
