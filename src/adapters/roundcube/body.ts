/**
 * Roundcube body handle: unifies the plain-text textarea and the TinyMCE
 * rich-text editor behind the provider-agnostic {@link BodyHandle} contract.
 *
 * The body mode is re-detected on every operation, so a runtime switch between
 * HTML and plain text (or a late editor initialisation) is handled naturally.
 */

import {
  applyHtmlMark,
  findLeadingMarker,
  readHtmlBodyText,
  removeHtmlMark,
} from '../../core/html-marking.js';
import { applyPlainBodyMark, removePlainBodyMark } from '../../core/marking.js';
import { leadingToken } from '../../core/parser.js';
import { type TlpLevel } from '../../core/tlp.js';
import { dispatchInputEvents, setInputValue } from '../../utils/dom.js';
import type { BodyHandle, MarkingOptions } from '../interface.js';
import { findEditorBody, findTextarea } from './selectors.js';

export class RoundcubeBody implements BodyHandle {
  constructor(private readonly doc: Document) {}

  mode(): 'html' | 'plain' {
    return findEditorBody(this.doc) ? 'html' : 'plain';
  }

  readText(): string {
    const editor = findEditorBody(this.doc);
    if (editor) {
      return readHtmlBodyText(editor.body);
    }
    return findTextarea(this.doc)?.value ?? '';
  }

  leadingLevel(): TlpLevel | null {
    const editor = findEditorBody(this.doc);
    if (editor) {
      return findLeadingMarker(editor.body)?.level ?? null;
    }
    const value = findTextarea(this.doc)?.value ?? '';
    return leadingToken(value)?.level ?? null;
  }

  apply(level: TlpLevel, options: MarkingOptions): void {
    const editor = findEditorBody(this.doc);
    if (editor) {
      applyHtmlMark(editor.body, editor.doc, level, { colorCoding: options.colorCoding });
      dispatchInputEvents(editor.body);
      return;
    }
    const textarea = findTextarea(this.doc);
    if (!textarea) {
      return;
    }
    setInputValue(textarea, applyPlainBodyMark(textarea.value, level));
  }

  remove(): void {
    const editor = findEditorBody(this.doc);
    if (editor) {
      removeHtmlMark(editor.body);
      dispatchInputEvents(editor.body);
      return;
    }
    const textarea = findTextarea(this.doc);
    if (textarea) {
      setInputValue(textarea, removePlainBodyMark(textarea.value));
    }
  }
}
