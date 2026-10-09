#!/usr/bin/env node
/**
 * Browser end-to-end tests against a real Roundcube Webmail instance.
 *
 * Orchestration:
 *   1. start the local Roundcube + GreenMail stack via docker compose
 *      (skipped when ROUNDCUBE_URL already responds);
 *   2. build the e2e extension;
 *   3. drive Chromium (Playwright, extension loaded) through the scenarios;
 *   4. write tests/e2e/artifacts/report.json and screenshots;
 *   5. tear the stack down.
 *
 * Only synthetic accounts and messages are used.
 */

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from 'node:net';

const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const e2eDir = join(rootDir, 'tests', 'e2e');
const artifactsDir = join(e2eDir, 'artifacts');
const extDir = join(rootDir, 'dist-e2e');
const composeFile = join(e2eDir, 'docker-compose.yml');

const BASE = process.env.ROUNDCUBE_URL ?? 'http://127.0.0.1:8081';
const IMAP_PORT = 3143;
const USER = 'test@example.com';
const PASS = 'test';

const baseSettings = {
  enabled: true,
  domains: [{ host: '127.0.0.1:8081', enabled: true }],
  missingClassification: 'warn',
  warnOnDowngrade: true,
  markSubject: true,
  markBody: true,
  colorCoding: true,
  theme: 'auto',
  version: 1,
};

// ---------------------------------------------------------------------------
// Lightweight test harness
// ---------------------------------------------------------------------------

const results = [];
let currentScenario = null;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

async function scenario(id, description, fn) {
  currentScenario = { id, description };
  const started = Date.now();
  try {
    await fn();
    results.push({ id, description, status: 'passed', durationMs: Date.now() - started });
    process.stdout.write(`  PASS  ${id}\n`);
  } catch (error) {
    results.push({
      id,
      description,
      status: 'failed',
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
    process.stdout.write(`  FAIL  ${id}: ${error instanceof Error ? error.message : String(error)}\n`);
  } finally {
    currentScenario = null;
  }
}

// ---------------------------------------------------------------------------
// Docker lifecycle + IMAP
// ---------------------------------------------------------------------------

async function httpOk(url) {
  try {
    const response = await fetch(url, { redirect: 'manual' });
    return response.status > 0 && response.status < 500;
  } catch {
    return false;
  }
}

async function ensureStack() {
  if (await httpOk(BASE)) {
    process.stdout.write('Roundcube already running; using it.\n');
    return false;
  }
  process.stdout.write('Starting Roundcube + GreenMail via docker compose...\n');
  execFileSync('docker', ['compose', '-f', composeFile, 'up', '-d'], { stdio: 'inherit' });
  for (let i = 0; i < 90; i++) {
    if (await httpOk(BASE)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Roundcube did not become reachable in time');
}

function stopStack() {
  try {
    execFileSync('docker', ['compose', '-f', composeFile, 'down', '-v'], { stdio: 'inherit' });
  } catch (error) {
    process.stderr.write(`docker compose down failed: ${error}\n`);
  }
}

class ImapClient {
  constructor() {
    this.socket = null;
    this.buffer = '';
    this.waiters = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket = connect(IMAP_PORT, '127.0.0.1');
      this.socket.on('connect', resolve);
      this.socket.on('error', reject);
      this.socket.on('data', (data) => {
        this.buffer += data.toString('binary');
        this.drain();
      });
    });
    await this.readUntil(/\r\n$/); // greeting
  }

  drain() {
    const waiters = this.waiters.slice();
    for (const waiter of waiters) {
      const match = waiter.pattern.exec(this.buffer);
      if (match) {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        waiter.resolve(this.buffer);
      }
    }
  }

  readUntil(pattern, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const existing = pattern.exec(this.buffer);
      if (existing) {
        return resolve(this.buffer);
      }
      const waiter = { pattern, resolve };
      this.waiters.push(waiter);
      setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new Error(`IMAP timeout waiting for ${pattern}`));
      }, timeoutMs);
    });
  }

  async command(line, expect) {
    this.buffer = '';
    this.socket.write(`${line}\r\n`);
    return this.readUntil(expect);
  }

  async login() {
    await this.command(`a1 LOGIN "${USER}" "${PASS}"`, /a1 (OK|NO)/);
    this.buffer = '';
  }

  async append(raw) {
    const bytes = Buffer.byteLength(raw, 'utf8');
    this.buffer = '';
    this.socket.write(`a2 APPEND "INBOX" (\\Seen) {${bytes}}\r\n`);
    await this.readUntil(/\+/);
    this.socket.write(raw);
    this.socket.write('\r\n');
    await this.readUntil(/a2 (OK|NO)/);
    this.buffer = '';
  }

  async searchAll() {
    this.buffer = '';
    this.socket.write('a3 SELECT INBOX\r\n');
    await this.readUntil(/a3 (OK|NO)/);
    this.buffer = '';
    this.socket.write('a4 UID SEARCH ALL\r\n');
    const response = await this.readUntil(/a4 (OK|NO)/);
    const match = /\* SEARCH ([0-9 ]*)/.exec(response);
    const uids = match && match[1].trim() ? match[1].trim().split(/\s+/).map(Number) : [];
    this.buffer = '';
    return uids;
  }

  async close() {
    try {
      this.socket?.write('a9 LOGOUT\r\n');
      this.socket?.end();
    } catch {
      /* ignore */
    }
  }
}

async function injectIncoming({ subject, body }) {
  const client = new ImapClient();
  await client.connect();
  await client.login();
  const raw = [
    'From: "Synthetic Sender" <sender@example.org>',
    `To: ${USER}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}@example.org>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ].join('\r\n');
  await client.append(raw);
  const uids = await client.searchAll();
  await client.close();
  return uids[uids.length - 1];
}

// ---------------------------------------------------------------------------
// Roundcube helpers
// ---------------------------------------------------------------------------

async function setSettings(context, settings) {
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
  }
  await sw.evaluate(async (s) => {
    await chrome.storage.local.set({ settings: s });
  }, settings);
}

async function login(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.fill('#rcmloginuser', USER);
  await page.fill('#rcmloginpwd', PASS);
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.click('button[type="submit"], input[type="submit"]'),
  ]);
  await page.waitForURL(/_task=mail/, { timeout: 15000 });
}

async function openCompose(page, params = '') {
  const url = `${BASE}/?_task=mail&_action=compose&_framed=1${params}`;
  // The very first compose load after a cold Roundcube start can be slow, so
  // retry once before failing.
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#composebody', { timeout: 15000 });
      await page.waitForSelector('.tlp-mail-marker-ui', { timeout: 15000 });
      return;
    } catch (error) {
      if (attempt >= 2) {
        throw error;
      }
    }
  }
}

async function selectLevel(page, level) {
  await page.evaluate((value) => {
    const host = document.querySelector('.tlp-mail-marker-ui');
    const input = host && host.shadowRoot && host.shadowRoot.querySelector(`input[value="${value}"]`);
    if (!input) {
      throw new Error(`TLP option ${value} not found`);
    }
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, level);
}

async function clickSend(page) {
  await page.locator('.send:visible').first().click();
}

async function clickSaveDraft(page) {
  await page.locator('.save.draft:visible, .save:visible').first().click();
}

async function markerCount(page) {
  return page.evaluate(() => (document.body.textContent?.match(/TLP:[A-Z]+(?:\+STRICT)?/g) ?? []).length);
}

function firstToken(text) {
  const m = /TLP:[A-Z]+(?:\+STRICT)?/.exec(text ?? '');
  return m ? m[0] : null;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function runScenarios(context) {
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    if (currentScenario) {
      currentScenario.pageErrors = currentScenario.pageErrors ?? [];
      currentScenario.pageErrors.push(e.message);
    }
  });
  const shot = async (name) => {
    // Let CSS transitions/animations finish so screenshots show the settled UI.
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(artifactsDir, `${name}.png`) }).catch(() => undefined);
  };

  await login(page);

  await scenario('selector-injected', 'Selector is injected into a new plain-text composer', async () => {
    await setSettings(context, baseSettings);
    await openCompose(page);
    assertEqual(await page.locator('.tlp-mail-marker-ui').count(), 1, 'selector host count');
    const checked = await page.locator('.tlp-mail-marker-ui input:checked').count();
    assertEqual(checked, 0, 'no level preselected for a new message');
    await shot('01-selector-injected');
  });

  await scenario('all-classifications', 'Every TLP 2.0 level marks subject and body correctly', async () => {
    const levels = ['TLP:CLEAR', 'TLP:GREEN', 'TLP:AMBER', 'TLP:AMBER+STRICT', 'TLP:RED'];
    for (const level of levels) {
      await openCompose(page);
      await selectLevel(page, level);
      const subject = await page.inputValue('#compose-subject');
      assertEqual(firstToken(subject), level, `subject token for ${level}`);
      assert(subject.startsWith(`[${level}]`), `subject should start with [${level}], got ${subject}`);
      const body = await page.inputValue('#composebody');
      assert(body.startsWith(level), `body should start with ${level}, got ${body.slice(0, 30)}`);
    }
    await shot('02-all-classifications');
  });

  await scenario('repeated-changes', 'Repeated classification changes never duplicate markings', async () => {
    await openCompose(page);
    await page.fill('#composebody', 'Message body');
    for (const level of ['TLP:AMBER', 'TLP:RED', 'TLP:GREEN', 'TLP:AMBER+STRICT', 'TLP:AMBER']) {
      await selectLevel(page, level);
      const subject = await page.inputValue('#compose-subject');
      assertEqual((subject.match(/TLP:/g) ?? []).length, 1, `one subject token after ${level}`);
      assertEqual(firstToken(subject), level, `subject token after ${level}`);
    }
    const body = await page.inputValue('#composebody');
    assertEqual((body.match(/^TLP:[A-Z]+(?:\+STRICT)?/gm) ?? []).length, 1, 'one leading body token');
    assert(body.includes('Message body'), 'body content preserved');
    await shot('03-repeated-changes');
  });

  await scenario('unicode-bidi', 'Arabic and bidirectional content is preserved', async () => {
    await openCompose(page);
    const content = 'مرحبا بالعالم\nשלום עולם\nMixed English + العربية';
    await page.fill('#composebody', content);
    await selectLevel(page, 'TLP:AMBER');
    const body = await page.inputValue('#composebody');
    assert(body.startsWith('TLP:AMBER'), 'marker present');
    assert(body.includes('مرحبا بالعالم'), 'Arabic preserved');
    assert(body.includes('שלום עולם'), 'Hebrew preserved');
  });

  await scenario('malicious-html', 'Adversarial HTML does not execute or corrupt the marker', async () => {
    await openCompose(page);
    await page.fill('#composebody', '<script>window.__pwned=1<\/script><img src=x onerror="window.__pwned=1">text');
    await selectLevel(page, 'TLP:AMBER');
    const pwned = await page.evaluate(() => window.__pwned);
    assert(pwned === undefined, 'injected script must not execute');
    const body = await page.inputValue('#composebody');
    assert(body.startsWith('TLP:AMBER'), 'marker present');
  });

  await scenario('rich-text-editor', 'HTML editor is marked without disturbing content', async () => {
    await openCompose(page);
    await page.fill('#composebody', 'Initial rich text');
    // Switch Roundcube to the HTML editor using its own public command.
    await page.evaluate(() => {
      // @ts-expect-error test-only access to the host page
      if (window.rcmail?.env) window.rcmail.env.editor_warned = true;
      // @ts-expect-error test-only access to the host page
      window.rcmail?.editor?.toggle(true);
    });
    await page.waitForSelector('iframe#composebody_ifr, iframe.tox-edit-area__iframe', {
      state: 'attached',
      timeout: 20000,
    });
    await page.waitForTimeout(1000);
    await selectLevel(page, 'TLP:RED');
    const info = await page.evaluate(() => {
      const iframe = document.querySelector('iframe#composebody_ifr, iframe.tox-edit-area__iframe');
      const body = iframe && iframe.contentDocument && iframe.contentDocument.body;
      return {
        markers: body ? body.querySelectorAll('.tlp-mail-marker').length : -1,
        text: body ? body.textContent : '',
      };
    });
    assertEqual(info.markers, 1, 'exactly one marker in the HTML editor');
    assert(info.text.includes('TLP:RED'), 'marker text present');
    assert(info.text.includes('Initial rich text'), 'content preserved');
    await shot('04-rich-text-editor');
  });

  await scenario('draft-save-and-reopen', 'Drafts keep the classification across save and reopen', async () => {
    await openCompose(page);
    await page.fill('#compose-subject', 'Draft subject');
    await page.fill('#composebody', 'Draft body content');
    await selectLevel(page, 'TLP:GREEN');
    await clickSaveDraft(page);
    await page.waitForTimeout(2500);

    // Reopen the draft from the Drafts mailbox.
    await page.goto(`${BASE}/?_task=mail&_mbox=Drafts`, { waitUntil: 'domcontentloaded' });
    const row = page.locator('#messagelist tr.message').first();
    await row.waitFor({ state: 'visible', timeout: 20000 });
    await row.dblclick();
    await page.waitForSelector('#composebody', { timeout: 20000 });
    await page.waitForSelector('.tlp-mail-marker-ui', { timeout: 15000 });
    const subject = await page.inputValue('#compose-subject');
    const body = await page.inputValue('#composebody');
    assertEqual(firstToken(subject), 'TLP:GREEN', 'draft subject classification preserved');
    assert(body.startsWith('TLP:GREEN'), 'draft body classification preserved');
    assert(body.includes('Draft body content'), 'draft body content preserved');
    await shot('05-draft-reopened');
  });

  await scenario('reply-preselect', 'Reply preselects the original classification', async () => {
    const uid = await injectIncoming({
      subject: '[TLP:AMBER] Incident Notification',
      body: 'TLP:AMBER\r\n\r\nDear colleague,\r\n\r\nPlease review the attached notification.\r\n',
    });
    await openCompose(page, `&_reply_uid=${uid}&_mbox=INBOX`);
    await page.waitForTimeout(1000);
    const checked = await page.locator('.tlp-mail-marker-ui input:checked').getAttribute('value');
    assertEqual(checked, 'TLP:AMBER', 'preselected level');
    const subject = await page.inputValue('#compose-subject');
    assertEqual(firstToken(subject), 'TLP:AMBER', 'reply subject classification');
    const body = await page.inputValue('#composebody');
    assert(body.startsWith('TLP:AMBER'), 'reply body carries the classification');
    assert(body.includes('Please review'), 'quoted content preserved');
    await shot('06-reply-preselect');
  });

  await scenario('reply-downgrade-warning', 'Lowering the classification warns and does not send silently', async () => {
    const uid = await injectIncoming({
      subject: '[TLP:RED] Sensitive Incident',
      body: 'TLP:RED\r\n\r\nFor your eyes only.\r\n',
    });
    await openCompose(page, `&_reply_uid=${uid}&_mbox=INBOX`);
    await page.waitForTimeout(1000);
    const preselected = await page.locator('.tlp-mail-marker-ui input:checked').getAttribute('value');
    assertEqual(preselected, 'TLP:RED', 'original classification preselected');
    await selectLevel(page, 'TLP:GREEN');
    const token = firstToken(await page.inputValue('#compose-subject'));
    assertEqual(token, 'TLP:GREEN', 'subject re-marked after change');
    await clickSend(page);
    try {
      await page.waitForSelector('.tlp-modal-host', { timeout: 8000 });
    } catch (error) {
      await shot('07-downgrade-warning-missing');
      const url = page.url();
      const body = await page.locator('body').innerText().catch(() => '');
      throw new Error(`no downgrade dialog; url=${url}; body=${body.slice(0, 120)}`);
    }
    const dialogText = await page.evaluate(
      () => document.querySelector('.tlp-modal-host')?.shadowRoot?.textContent ?? '',
    );
    assert(dialogText.includes('Lower') || dialogText.includes('warnings'), 'downgrade warning shown');
    assert(!dialogText.includes('This message was not sent.'), 'should be a confirm, not a hard block');
    await shot('07-downgrade-warning');
  });

  await scenario('quoted-text-warning', 'Quoted text more restrictive than the selection asks for confirmation', async () => {
    const uid = await injectIncoming({
      subject: '[TLP:GREEN] Weekly update',
      body: 'TLP:GREEN\r\n\r\nSummary for the community.\r\n\r\n> TLP:RED\r\n> Credentials for the affected host were rotated.\r\n',
    });
    await openCompose(page, `&_reply_uid=${uid}&_mbox=INBOX`);
    await page.waitForTimeout(1000);
    const preselected = await page.locator('.tlp-mail-marker-ui input:checked').getAttribute('value');
    assertEqual(preselected, 'TLP:GREEN', 'subject classification preselected');
    await clickSend(page);
    await page.waitForSelector('.tlp-modal-host', { timeout: 8000 });
    const dialogText = await page.evaluate(
      () => document.querySelector('.tlp-modal-host')?.shadowRoot?.textContent ?? '',
    );
    assert(dialogText.includes('more restrictive'), 'quoted-text warning shown');
    assert(dialogText.includes('TLP:RED'), 'warning names the quoted level');
    await shot('09-quoted-text-warning');
  });

  await scenario('missing-classification-block', 'Sending without a classification is blocked when configured', async () => {
    await setSettings(context, { ...baseSettings, missingClassification: 'block' });
    await openCompose(page);
    await page.fill('#composebody', 'Unclassified message');
    await clickSend(page);
    await page.waitForSelector('.tlp-modal-host', { timeout: 5000 });
    const dialogText = await page.evaluate(
      () => document.querySelector('.tlp-modal-host')?.shadowRoot?.textContent ?? '',
    );
    assert(dialogText.includes('classification required') || dialogText.includes('not sent'), 'hard block dialog shown');
    await shot('08-missing-classification-block');
    await setSettings(context, baseSettings);
  });

  await scenario('multiple-compose-windows', 'Two composers keep independent classifications', async () => {
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    await Promise.all([openCompose(pageA), openCompose(pageB)]);
    await selectLevel(pageA, 'TLP:RED');
    await selectLevel(pageB, 'TLP:GREEN');
    assertEqual(firstToken(await pageA.inputValue('#compose-subject')), 'TLP:RED', 'window A level');
    assertEqual(firstToken(await pageB.inputValue('#compose-subject')), 'TLP:GREEN', 'window B level');
    await pageA.close();
    await pageB.close();
  });

  await scenario('unsupported-interface', 'The extension stays out of non-composer pages', async () => {
    await page.goto(`${BASE}/?_task=mail&_mbox=INBOX`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    assertEqual(await page.locator('.tlp-mail-marker-ui').count(), 0, 'no selector outside the composer');
  });

  await scenario('extension-pages', 'Options page and popup render (captured for store listing)', async () => {
    const [sw] = context.serviceWorkers();
    // URL.origin is "null" for chrome-extension:// URLs, so slice the string.
    const extensionOrigin = sw.url().split('/').slice(0, 3).join('/');
    // A neutral hostname so no test host appears in published screenshots.
    await setSettings(context, {
      ...baseSettings,
      domains: [{ host: 'mail.example.gov', enabled: true }],
      defaultLevel: 'TLP:AMBER',
    });
    await page.goto(`${extensionOrigin}/options.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    assert((await page.locator('body').innerText()).includes('mail.example.gov'), 'options lists the host');
    await shot('10-options-page');
    await page.goto(`${extensionOrigin}/popup.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    assert((await page.locator('body').innerText()).includes('AMBER+STRICT'), 'popup shows the TLP legend');
    // A toolbar popup is narrow; capture it at roughly its real size.
    await page.setViewportSize({ width: 400, height: 560 });
    await shot('11-popup');
    await page.setViewportSize({ width: 1280, height: 800 });
    await setSettings(context, baseSettings);
  });

  await scenario('organisation-profile', 'Organisation profile previews, imports and exports without changing domain permissions', async () => {
    const [sw] = context.serviceWorkers();
    const extensionOrigin = sw.url().split('/').slice(0, 3).join('/');
    await setSettings(context, baseSettings);
    await page.goto(`${extensionOrigin}/options.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#allowed-levels input').length === 5);
    const profile = { format: 'tlp-mail-marker-profile', version: 1, name: 'Synthetic team', settings: {
      allowedLevels: ['TLP:GREEN', 'TLP:AMBER'], defaultLevel: 'TLP:AMBER', missingClassification: 'block',
    } };
    await page.locator('#profile-file').setInputFiles({ name: 'team.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(profile)) });
    await page.waitForFunction(() => !document.getElementById('profile-apply').disabled);
    assertEqual((await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings)).defaultLevel, baseSettings.defaultLevel, 'preview makes no changes');
    await page.locator('#profile-apply').click();
    await page.waitForFunction(() => document.getElementById('profile-status').textContent.includes('Applied Synthetic team'));
    const applied = await sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    assertEqual(applied.allowedLevels.join(','), 'TLP:GREEN,TLP:AMBER', 'only approved levels');
    assertEqual(applied.defaultLevel, 'TLP:AMBER', 'shared default');
    assertEqual(applied.missingClassification, 'block', 'shared required rule');
    assertEqual(JSON.stringify(applied.domains.map(({ host, enabled }) => [host, enabled])), JSON.stringify(baseSettings.domains.map(({ host, enabled }) => [host, enabled])), 'domain access stays local');
    await page.locator('#profile-name').fill('Synthetic export');
    const downloadEvent = page.waitForEvent('download'); await page.locator('#profile-export').click();
    const download = await downloadEvent;
    const exported = JSON.parse(readFileSync(await download.path(), 'utf8'));
    assertEqual(JSON.stringify(exported.settings), JSON.stringify(profile.settings), 'export contains the same shared rules');
    assertEqual(Object.keys(exported.settings).length, 3, 'export excludes domains and unrelated settings');
    await page.locator('#profile-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":99}') });
    await page.waitForFunction(() => document.getElementById('profile-status').textContent.length > 0);
    assert(await page.locator('#profile-apply').isDisabled(), 'invalid profile cannot be applied');
    await setSettings(context, baseSettings);
  });

  await page.close();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(artifactsDir, { recursive: true });

  if (!existsSync(join(extDir, 'manifest.json'))) {
    process.stdout.write('Building e2e extension...\n');
    execFileSync(process.execPath, [join(rootDir, 'scripts', 'build.mjs'), '--target=e2e'], { stdio: 'inherit' });
  }

  const startedStack = await ensureStack();
  const userDataDir = mkdtempSync(join(tmpdir(), 'tlp-e2e-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      // 1280x800 is the Chrome Web Store screenshot size.
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
    });
    context.on('page', (p) => p.on('dialog', (dialog) => dialog.accept().catch(() => undefined)));

    // The extension opens its options page on first install; close it so it
    // does not interrupt navigation during the run.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    for (const p of context.pages()) {
      if (p.url().includes('options.html')) {
        await p.close().catch(() => undefined);
      }
    }

    process.stdout.write('\nRunning scenarios:\n');
    await runScenarios(context);

    const passed = results.filter((r) => r.status === 'passed').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const report = {
      generatedAt: new Date().toISOString(),
      roundcubeUrl: BASE,
      extensionDir: extDir,
      summary: { total: results.length, passed, failed },
      scenarios: results,
    };
    writeFileSync(join(artifactsDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`\nE2E: ${passed} passed, ${failed} failed (${results.length} total)\n`);
    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await context?.close().catch(() => undefined);
    rmSync(userDataDir, { recursive: true, force: true });
    if (startedStack) {
      stopStack();
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
