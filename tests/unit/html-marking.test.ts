// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MARKER_ATTR,
  MARKER_CLASS,
  applyHtmlMark,
  createMarkerElement,
  findLeadingMarker,
  readHtmlBodyText,
  removeHtmlMark,
} from '../../src/core/html-marking.js';

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  root.id = 'body';
  document.body.appendChild(root);
});

function markers(): Element[] {
  return Array.from(root.querySelectorAll(`.${MARKER_CLASS}`));
}

describe('HTML marking', () => {
  it('inserts a single canonical marker as the first child', () => {
    root.innerHTML = '<p>Dear colleagues</p>';
    applyHtmlMark(root, document, 'TLP:AMBER');
    expect(markers()).toHaveLength(1);
    expect(root.firstElementChild).toBe(markers()[0]);
    expect(markers()[0]!.getAttribute(MARKER_ATTR)).toBe('TLP:AMBER');
    expect(markers()[0]!.textContent).toBe('TLP:AMBER');
    expect(root.querySelector('p')!.textContent).toBe('Dear colleagues');
  });

  it('is idempotent', () => {
    root.innerHTML = '<p>Body</p>';
    applyHtmlMark(root, document, 'TLP:AMBER');
    applyHtmlMark(root, document, 'TLP:AMBER');
    applyHtmlMark(root, document, 'TLP:AMBER');
    expect(markers()).toHaveLength(1);
  });

  it('replaces an existing marking rather than duplicating it', () => {
    root.innerHTML = '<p>Body</p>';
    applyHtmlMark(root, document, 'TLP:GREEN');
    applyHtmlMark(root, document, 'TLP:RED');
    expect(markers()).toHaveLength(1);
    expect(markers()[0]!.getAttribute(MARKER_ATTR)).toBe('TLP:RED');
  });

  it('adopts a marker produced by plain→HTML conversion', () => {
    root.innerHTML = '<div>TLP:AMBER</div><p>Body</p>';
    applyHtmlMark(root, document, 'TLP:RED');
    expect(markers()).toHaveLength(1);
    // the adopted div is gone, replaced by the canonical marker
    expect(root.textContent).not.toContain('TLP:AMBER');
    expect(root.textContent).toContain('TLP:RED');
    expect(root.querySelector('p')!.textContent).toBe('Body');
  });

  it('preserves inline content when the marker shares a block', () => {
    root.innerHTML = '<p>TLP:AMBER<br>Important body text</p>';
    applyHtmlMark(root, document, 'TLP:AMBER');
    expect(markers()).toHaveLength(1);
    expect(root.textContent).toContain('Important body text');
    // only one TLP token should remain (the canonical marker)
    expect((root.textContent!.match(/TLP:/g) ?? []).length).toBe(1);
  });

  it('detects own and adopted markers', () => {
    applyHtmlMark(root, document, 'TLP:RED');
    expect(findLeadingMarker(root)).toEqual({ level: 'TLP:RED', own: true });

    root.innerHTML = '<div>TLP:GREEN</div><p>x</p>';
    expect(findLeadingMarker(root)).toEqual({ level: 'TLP:GREEN', own: false });
  });

  it('removes markings, including adopted ones', () => {
    applyHtmlMark(root, document, 'TLP:AMBER');
    removeHtmlMark(root);
    expect(markers()).toHaveLength(0);
    expect(root.querySelector(`.${MARKER_CLASS}`)).toBeNull();

    root.innerHTML = '<div>TLP:RED</div><p>keep</p>';
    removeHtmlMark(root);
    expect(root.textContent).not.toContain('TLP:RED');
    expect(root.textContent).toContain('keep');
  });

  it('does not touch quoted content or signatures', () => {
    root.innerHTML =
      '<div id="_rc_sig">-- <br>Jane</div><blockquote><p>Quoted original TLP:GREEN</p></blockquote>';
    applyHtmlMark(root, document, 'TLP:AMBER');
    expect(root.querySelector('#_rc_sig')!.textContent).toContain('Jane');
    expect(root.querySelector('blockquote')!.textContent).toContain('Quoted original TLP:GREEN');
  });

  it('reads a sensible plain-text rendering', () => {
    root.innerHTML = '<div>TLP:AMBER</div><p>Line one</p><p>Line two</p>';
    const text = readHtmlBodyText(root);
    expect(text.startsWith('TLP:AMBER')).toBe(true);
    expect(text).toContain('Line one');
    expect(text).toContain('Line two');
  });

  it('prefixes blockquote lines with > so quoted text is distinguishable', () => {
    root.innerHTML = '<div>TLP:GREEN</div><p>New</p><blockquote><p>TLP:RED</p><blockquote>deeper</blockquote></blockquote>';
    const text = readHtmlBodyText(root);
    expect(text).toContain('> TLP:RED');
    expect(text).toContain('> > deeper');
    expect(text).toMatch(/^TLP:GREEN\n+New/);
  });

  it('renders the marker with textContent only (no child elements, no injection)', () => {
    const marker = createMarkerElement(document, 'TLP:RED');
    expect(marker.children).toHaveLength(0);
    expect(marker.textContent).toBe('TLP:RED');
    expect(marker.innerHTML).toBe('TLP:RED');
  });

  it('is not confused by adversarial incoming content', () => {
    root.innerHTML =
      '<div>TLP:AMBER</div><p><img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>text</p>';
    applyHtmlMark(root, document, 'TLP:AMBER');
    // Our marker is safe and canonical.
    expect(markers()).toHaveLength(1);
    expect((root.textContent!.match(/TLP:AMBER/g) ?? []).length).toBe(1);
    // The adversarial content is preserved but not executed by our code.
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it('omits colour when colour coding is disabled', () => {
    applyHtmlMark(root, document, 'TLP:AMBER', { colorCoding: false });
    const style = markers()[0]!.getAttribute('style') ?? '';
    expect(style).not.toContain('background-color:#000000');
    expect(style).toContain('transparent');
  });
});
