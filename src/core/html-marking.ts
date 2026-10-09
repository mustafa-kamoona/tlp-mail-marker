/**
 * Marking transforms for HTML message bodies.
 *
 * DOM-aware but framework-free, so it runs unchanged in a content script and in
 * jsdom-based tests. Only a single, well-known marker element is ever created;
 * untrusted incoming content is never used as HTML and never rendered.
 *
 * The transforms are idempotent and only ever touch the leading marking block,
 * so signatures, quotes, links and attachments are preserved.
 */

import { leadingToken } from './parser.js';
import { removePlainBodyMark } from './marking.js';
import { type TlpLevel, formatLevel, getDefinition, parseLevel } from './tlp.js';

export const MARKER_CLASS = 'tlp-mail-marker';
export const MARKER_ATTR = 'data-tlp-level';

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'FIELDSET', 'FIGCAPTION',
  'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR',
  'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL',
]);

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function normalizeNewlines(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

/** Serialise an element's content to plain text, inserting line breaks for blocks. */
export function htmlToText(node: Node): string {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3 /* TEXT_NODE */) {
      out += (child as Text).data;
    } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const el = child as HTMLElement;
      const tag = el.tagName;
      if (tag === 'BR') {
        out += '\n';
      } else if (tag === 'IMG') {
        out += el.getAttribute('alt') ?? '';
      } else if (tag === 'BLOCKQUOTE') {
        // Prefix quoted lines like a plain-text reply so quote-aware analysis
        // (see quotedLevels) works for HTML bodies too.
        const quoted = htmlToText(el)
          .replace(/^\n+|\n+$/g, '')
          .split('\n')
          .map((line) => (line.length > 0 ? `> ${line}` : '>'))
          .join('\n');
        out += `\n${quoted}\n`;
      } else if (BLOCK_TAGS.has(tag)) {
        out += `\n${htmlToText(el)}\n`;
      } else {
        out += htmlToText(el);
      }
    }
  });
  return out;
}

/** Plain-text rendering of an HTML body, for analysis and validation. */
export function readHtmlBodyText(root: Node): string {
  return normalizeNewlines(htmlToText(root));
}

function isEmptyNode(node: Node): boolean {
  if (node.nodeType === 3) {
    return normalizeText((node as Text).data) === '';
  }
  if (node.nodeType === 1) {
    const el = node as Element;
    if (normalizeText(el.textContent) !== '') {
      return false;
    }
    return !el.querySelector('img, hr, video, audio, table, iframe, object, embed');
  }
  return true;
}

function isIgnorableNode(node: Node): boolean {
  if (node.nodeType === 8 /* COMMENT_NODE */) {
    return true;
  }
  if (node.nodeType === 3) {
    return normalizeText((node as Text).data) === '';
  }
  if (node.nodeType === 1) {
    const el = node as Element;
    if (el.tagName === 'BR') {
      return true;
    }
    return isEmptyNode(el);
  }
  return false;
}

/** First child node that carries actual content, skipping empty/whitespace nodes. */
function firstMeaningful(root: ParentNode): Node | null {
  for (const node of Array.from(root.childNodes)) {
    if (!isIgnorableNode(node)) {
      return node;
    }
  }
  return null;
}

function markerLevel(el: Element): TlpLevel | null {
  const attr = el.getAttribute(MARKER_ATTR);
  const fromAttr = attr ? parseLevel(attr) : null;
  if (fromAttr) {
    return fromAttr;
  }
  return leadingToken(readHtmlBodyText(el))?.level ?? null;
}

export interface LeadingMarker {
  level: TlpLevel;
  /** True when the marker is the extension's own marker element. */
  own: boolean;
}

/**
 * Detect the leading marking of an editor body. Tolerates markers produced by
 * HTML↔plain conversion (a leading block whose text is just a TLP token) as
 * well as the extension's own marker element.
 */
export function findLeadingMarker(root: ParentNode): LeadingMarker | null {
  const node = firstMeaningful(root);
  if (!node) {
    return null;
  }
  if (node.nodeType === 1) {
    const el = node as Element;
    if (el.classList.contains(MARKER_CLASS)) {
      const level = markerLevel(el);
      return level ? { level, own: true } : null;
    }
    const token = leadingToken(readHtmlBodyText(el));
    return token ? { level: token.level, own: false } : null;
  }
  if (node.nodeType === 3) {
    const token = leadingToken((node as Text).data);
    return token ? { level: token.level, own: false } : null;
  }
  return null;
}

function stripLeadingTokenDeep(el: Element): void {
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, 4 /* SHOW_TEXT */);
  const first = walker.nextNode() as Text | null;
  if (!first) {
    return;
  }
  if (leadingToken(first.data) && /^\s*$/.test(first.data.slice(0, leadingToken(first.data)!.index))) {
    first.data = removePlainBodyMark(first.data);
  }
}

/** Remove the extension's marker elements and any adopted leading marking block. */
export function removeHtmlMark(root: ParentNode): void {
  root.querySelectorAll(`.${MARKER_CLASS}`).forEach((el) => el.remove());

  const node = firstMeaningful(root);
  if (!node) {
    return;
  }
  if (node.nodeType === 3) {
    const text = node as Text;
    if (leadingToken(text.data)) {
      text.data = removePlainBodyMark(text.data);
      if (text.data === '') {
        text.remove();
      }
    }
    return;
  }
  if (node.nodeType === 1) {
    const el = node as HTMLElement;
    if (el.classList.contains(MARKER_CLASS)) {
      el.remove();
    } else if (leadingToken(readHtmlBodyText(el))) {
      stripLeadingTokenDeep(el);
      if (isEmptyNode(el)) {
        el.remove();
      }
    }
  }
}

function markerStyle(level: TlpLevel, colorCoding: boolean): string {
  const def = getDefinition(level);
  const colors = colorCoding
    ? [`background-color:${def.background}`, `color:${def.foreground}`, 'padding:4px 10px', 'border-radius:4px']
    : ['background-color:transparent', 'color:inherit', 'padding:0', 'border:1px solid currentColor', 'border-radius:2px', 'padding:2px 6px'];
  return [
    'display:block',
    'width:fit-content',
    'max-width:100%',
    ...colors,
    'font-weight:700',
    'font-size:12px',
    'line-height:1.4',
    'margin:0 0 10px 0',
    'letter-spacing:0.5px',
    'font-family:Consolas,Menlo,monospace',
    'white-space:nowrap',
  ].join(';');
}

export interface HtmlMarkingOptions {
  /** Use official TLP colours. The text label is present either way. */
  colorCoding?: boolean;
}

export function createMarkerElement(
  doc: Document,
  level: TlpLevel,
  options: HtmlMarkingOptions = {},
): HTMLElement {
  const el = doc.createElement('div');
  el.className = MARKER_CLASS;
  el.setAttribute(MARKER_ATTR, formatLevel(level));
  el.setAttribute('style', markerStyle(level, options.colorCoding !== false));
  // textContent only: never innerHTML, so nothing can be injected.
  el.textContent = formatLevel(level);
  return el;
}

/**
 * Apply an HTML marking. Replaces any existing marking (own or adopted) and
 * inserts a single canonical marker as the first content of the body.
 */
export function applyHtmlMark(
  root: HTMLElement | DocumentFragment,
  doc: Document,
  level: TlpLevel,
  options: HtmlMarkingOptions = {},
): HTMLElement {
  removeHtmlMark(root);
  const marker = createMarkerElement(doc, level, options);
  if (root.firstChild) {
    root.insertBefore(marker, root.firstChild);
  } else {
    root.appendChild(marker);
  }
  return marker;
}
