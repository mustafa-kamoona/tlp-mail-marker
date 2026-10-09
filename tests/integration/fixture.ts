/**
 * Roundcube composer fixture for integration tests.
 *
 * Reproduces the stable composer contract (subject field, `#composebody`
 * textarea, form, TinyMCE-style iframe, send/save controls) faithfully enough
 * to exercise the adapter and controller without a live server. Real-browser
 * E2E runs against an actual Roundcube instance (see tests/e2e).
 */

import { JSDOM } from 'jsdom';

export interface ComposerFixtureOptions {
  subject?: string;
  body?: string;
  /** When set, an HTML editor iframe is created with this body content. */
  html?: string;
  url?: string;
  /** Include send / save-draft controls (default true). */
  controls?: boolean;
}

export interface ComposerFixture {
  dom: JSDOM;
  window: Window & typeof globalThis;
  document: Document;
  form: HTMLFormElement;
  subjectInput: HTMLInputElement;
  textarea: HTMLTextAreaElement;
  iframe: HTMLIFrameElement | null;
  sendControl: HTMLElement | null;
  saveControl: HTMLElement | null;
  addHtmlEditor(html: string): void;
}

export function createComposerFixture(options: ComposerFixtureOptions = {}): ComposerFixture {
  const url = options.url ?? 'https://mail.example.com/?_task=mail&_action=compose&_framed=1';
  const controls = options.controls !== false;

  const dom = new JSDOM(
    `<!doctype html><html><body>
      <form id="compose-form" name="form" method="post" action="?_task=mail&_action=send">
        <div id="compose-content" class="content">
          <div id="compose-headers">
            <div id="compose_subject" class="form-group row">
              <label class="col-2" for="compose-subject">Subject</label>
              <div class="col-10">
                <input id="compose-subject" name="_subject" type="text" class="form-control">
              </div>
            </div>
          </div>
          <div id="composebodycontainer">
            <textarea id="composebody" name="_message" class="form-control"></textarea>
          </div>
          ${
            controls
              ? `<div class="formbuttons">
                  <a class="button save draft" href="#" onclick="return rcmail.command('savedraft', this, event)">Save</a>
                  <a class="button send" href="#" onclick="return rcmail.command('send', this, event)">Send</a>
                 </div>`
              : ''
          }
        </div>
      </form>
    </body></html>`,
    { url, pretendToBeVisual: true },
  );

  const document = dom.window.document;
  const form = document.getElementById('compose-form') as HTMLFormElement;
  const subjectInput = document.getElementById('compose-subject') as HTMLInputElement;
  const textarea = document.getElementById('composebody') as HTMLTextAreaElement;
  const sendControl = document.querySelector<HTMLElement>('a.send');
  const saveControl = document.querySelector<HTMLElement>('a.save.draft');

  if (options.subject !== undefined) {
    subjectInput.value = options.subject;
  }
  if (options.body !== undefined) {
    textarea.value = options.body;
  }

  const addHtmlEditor = (html: string): void => {
    const wrapper = document.createElement('div');
    wrapper.className = 'tox-edit-area';
    const iframe = document.createElement('iframe');
    iframe.className = 'tox-edit-area__iframe';
    wrapper.appendChild(iframe);
    const container = document.getElementById('composebodycontainer')!;
    container.appendChild(wrapper);
    const frameDoc = iframe.contentDocument!;
    frameDoc.body.innerHTML = html;
  };

  let iframe: HTMLIFrameElement | null = null;
  if (options.html !== undefined) {
    addHtmlEditor(options.html);
    iframe = document.querySelector<HTMLIFrameElement>('iframe.tox-edit-area__iframe');
  }

  return {
    dom,
    window: dom.window as unknown as Window & typeof globalThis,
    document,
    form,
    subjectInput,
    textarea,
    iframe,
    sendControl,
    saveControl,
    addHtmlEditor,
  };
}

/** Minimal non-composer document (e.g. a message view or unrelated site). */
export function createUnsupportedFixture(): ComposerFixture {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="message-view"><h1>Hello</h1></div></body></html>',
    { url: 'https://mail.example.com/?_task=mail&_action=show&_uid=1' },
  );
  const document = dom.window.document;
  return {
    dom,
    window: dom.window as unknown as Window & typeof globalThis,
    document,
    form: document.createElement('form'),
    subjectInput: document.createElement('input'),
    textarea: document.createElement('textarea'),
    iframe: null,
    sendControl: null,
    saveControl: null,
    addHtmlEditor: () => undefined,
  };
}
