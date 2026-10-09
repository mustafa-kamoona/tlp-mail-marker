import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { connect } from './marionette.mjs';
import { readDrafts } from './imap.mjs';

const binary = process.env.THUNDERBIRD_BINARY;
const imapPort = Number(process.env.THUNDERBIRD_IMAP_PORT || 0);
if (!binary) throw new Error('Set THUNDERBIRD_BINARY to the Thunderbird executable.');
const scratch = await mkdtemp(join(tmpdir(), 'tlp-thunderbird-'));
const profile = join(scratch, 'profile'), extension = join(scratch, 'extension');
console.log(`Disposable Thunderbird profile: ${profile}`);
const artifacts = resolve('tests/thunderbird/artifacts');
await mkdir(profile); await mkdir(artifacts, { recursive: true });
await cp(resolve('dist-thunderbird'), extension, { recursive: true });
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
// Extra automation permissions/resources are exclusive to this disposable copy.
manifest.permissions.push('compose.send', 'compose.save', 'messagesRead', 'tabs');
manifest.optional_permissions = [];
manifest.background.scripts.push('test-driver.js');
manifest.experiment_apis = { testReporter: { schema: 'test-report-schema.json', parent: { scopes: ['addon_parent'], paths: [['testReporter']], script: 'test-report-api.js' } } };
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
await cp(resolve('tests/thunderbird/harness.js'), join(extension, 'test-harness.js'));
await writeFile(join(extension, 'test-harness.html'), '<!doctype html><title>Synthetic Thunderbird tests</title><script src="test-harness.js"></script>');
await writeFile(join(extension, 'test-driver.js'), 'messenger.windows.create({url:messenger.runtime.getURL("test-harness.html"),type:"popup",width:500,height:500});');
await writeFile(join(extension, 'test-report-schema.json'), JSON.stringify([{ namespace: 'testReporter', functions: [
  { name: 'report', type: 'function', parameters: [{ name: 'kind', type: 'string' }, { name: 'data', type: 'string' }] },
  { name: 'composersUnlocked', type: 'function', async: true, parameters: [] },
  { name: 'imapDrafts', type: 'function', async: true, parameters: [{ name: 'enabled', type: 'boolean' }] },
] }]));
await writeFile(join(extension, 'test-report-api.js'), `this.testReporter = class extends ExtensionCommon.ExtensionAPI { getAPI() { return { testReporter: {
  report(kind, data) { Services.prefs.setStringPref('tlp.test.' + kind, data); },
  async composersUnlocked() { const windows = [...Services.wm.getEnumerator('msgcompose')]; return windows.length > 0 && windows.every(window => !window.gWindowLocked); }
  ,async imapDrafts(enabled) {
    const { MailServices } = ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
    if (!Services.prefs.prefHasUserValue('tlp.test.imapDrafts')) return false;
    const identity = MailServices.accounts.defaultAccount.defaultIdentity;
    const current = identity.draftsFolderURI;
    identity.draftsFolderURI = Services.prefs.getStringPref(enabled ? 'tlp.test.imapDrafts' : 'tlp.test.localDrafts');
    return current;
  }
} }; } };`);
const mail = [];
const sockets = new Set();
const smtp = net.createServer(socket => {
  sockets.add(socket); socket.on('close', () => sockets.delete(socket));
  socket.write('220 synthetic.local ESMTP\r\n');
  let buffer = '', data = false, message = [];
  socket.on('data', chunk => {
    buffer += chunk.toString();
    while (buffer.includes('\r\n')) {
      const end = buffer.indexOf('\r\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      if (data) {
        if (line === '.') { mail.push(message.join('\r\n')); message = []; data = false; socket.write('250 message accepted\r\n'); }
        else message.push(line.replace(/^\.\./, '.'));
      } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250 synthetic.local\r\n');
      else if (/^DATA/i.test(line)) { data = true; socket.write('354 end with dot\r\n'); }
      else if (/^QUIT/i.test(line)) { socket.end('221 goodbye\r\n'); }
      else socket.write('250 OK\r\n');
    }
  });
});
await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve));
const smtpPort = smtp.address().port;
const portServer = net.createServer();
await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
const marionettePort = portServer.address().port;
await new Promise(resolve => portServer.close(resolve));
await writeFile(join(profile, 'user.js'), Object.entries({
  'marionette.enabled': true, 'marionette.port': marionettePort,
  'mail.provider.enabled': false, 'mail.provider.suppress_dialog_on_startup': true,
  'mailnews.start_page.enabled': false, 'mailnews.start_page.url': 'about:blank',
  'mail.shell.checkDefaultClient': false, 'app.update.enabled': false, 'app.update.auto': false,
  'extensions.update.enabled': false, 'datareporting.healthreport.uploadEnabled': false,
  'datareporting.policy.dataSubmissionEnabled': false, 'toolkit.telemetry.enabled': false,
  'mailnews.sendInBackground': false,
}).map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`).join('\n'));
const processApp = spawn(binary, ['-no-remote', '-profile', profile, '-marionette'], { env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; processApp.stdout.on('data', chunk => { log += chunk; }); processApp.stderr.on('data', chunk => { log += chunk; });
let client;
try {
  for (let i = 0; i < 100; i++) {
    try { client = await connect(marionettePort); break; } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  if (!client) throw new Error('Thunderbird did not start its automation server.');
  const version = await client.execute('return Services.appinfo.version;');
  await client.execute(`
    const { MailServices } = ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
    MailServices.accounts.createLocalMailAccount();
    const localServer = MailServices.accounts.localFoldersServer;
    const server = MailServices.accounts.createIncomingServer('test', '127.0.0.1', 'pop3');
    server.port = 1;
    const account = MailServices.accounts.createAccount(); account.incomingServer = server;
    const identity = MailServices.accounts.createIdentity();
    identity.email = 'sender@example.com'; identity.fullName = 'Synthetic Tester'; identity.composeHtml = true;
    identity.doFcc = false;
    account.addIdentity(identity); account.defaultIdentity = identity; MailServices.accounts.defaultAccount = account;
    const smtp = MailServices.outgoingServer.createServer('smtp').QueryInterface(Ci.nsISmtpServer);
    smtp.hostname = '127.0.0.1'; smtp.port = arguments[0]; smtp.authMethod = 1; smtp.socketType = 0;
    identity.smtpServerKey = smtp.key;
    const root = localServer.rootFolder;
    for (const [name, flag] of [['Drafts', Ci.nsMsgFolderFlags.Drafts], ['Sent', Ci.nsMsgFolderFlags.SentMail], ['Outbox', Ci.nsMsgFolderFlags.Queue]]) {
      if (!root.containsChildNamed(name)) root.createSubfolder(name, null);
      root.getChildNamed(name).setFlag(flag);
    }
    identity.draftsFolderURI = root.getChildNamed('Drafts').URI;
    identity.fccFolderURI = root.getChildNamed('Sent').URI;
    Services.prefs.setStringPref('mail.default_sendlater_uri', root.getChildNamed('Outbox').URI);
    return true;
  `, [smtpPort]);
  await client.command('WebDriver:SetTimeouts', { script: 30000 });
  const keySetup = await client.command('WebDriver:ExecuteAsyncScript', {
    script: `const done = arguments[arguments.length - 1];
      (async () => {
        const { RNP } = ChromeUtils.importESModule('chrome://openpgp/content/modules/RNP.sys.mjs');
        const { MailServices } = ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
        if (!await RNP.init()) throw new Error('OpenPGP runtime unavailable');
        const sender = await RNP.genKey('Synthetic Sender <sender@example.com>', 'ECC', 0, 1, '');
        const recipient = await RNP.genKey('Synthetic Recipient <recipient@example.com>', 'ECC', 0, 1, '');
        if (!sender || !recipient) throw new Error('Synthetic OpenPGP key generation failed');
        await RNP.saveKeyRings();
        MailServices.accounts.defaultAccount.defaultIdentity.setUnicharAttribute('openpgp_key_id', sender);
        return true;
      })().then(done, error => done({ error: String(error) }));`, args: [], newSandbox: true,
  });
  if (keySetup.value?.error) throw new Error(keySetup.value.error);
  if (imapPort) {
    const imapSetup = await client.command('WebDriver:ExecuteAsyncScript', {
      script: `const done = arguments[arguments.length - 1], port = arguments[0];
        (async () => {
          const { MailServices } = ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
          const identity = MailServices.accounts.defaultAccount.defaultIdentity;
          Services.prefs.setStringPref('tlp.test.localDrafts', identity.draftsFolderURI);
          const server = MailServices.accounts.createIncomingServer('synthetic', '127.0.0.1', 'imap');
          server.port = port; server.socketType = 0; server.authMethod = 3; server.password = 'synthetic';
          const account = MailServices.accounts.createAccount(); account.incomingServer = server;
          const root = server.rootFolder; root.createSubfolder('Drafts', null);
          for (let i = 0; i < 100 && !root.containsChildNamed('Drafts'); i++) await new Promise(resolve => setTimeout(resolve, 100));
          const drafts = root.getChildNamed('Drafts'); drafts.setFlag(Ci.nsMsgFolderFlags.Drafts);
          Services.prefs.setStringPref('tlp.test.imapDrafts', drafts.URI); return true;
        })().then(done, error => done({ error: String(error) }));`, args: [imapPort], newSandbox: true,
    });
    if (imapSetup.value?.error) throw new Error(imapSetup.value.error);
  }
  await client.command('WebDriver:ExecuteAsyncScript', {
    script: `const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      const file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile); file.initWithPath(arguments[0]);
      const done = arguments[arguments.length - 1]; AddonManager.installTemporaryAddon(file).then(addon => done({ id: addon.id }), error => done({ error: String(error) }));`,
    args: [extension], newSandbox: true,
  }).then(result => { if (result.value?.error) throw new Error(result.value.error); });
  let results, previous = '';
  for (let i = 0; i < 180; i++) {
    const state = await client.execute(`return { result: Services.prefs.getStringPref('tlp.test.result', ''), progress: Services.prefs.getStringPref('tlp.test.progress', '') };`);
    if (state.progress && state.progress !== previous) { previous = state.progress; console.log(state.progress); }
    if (state.result) { results = JSON.parse(state.result); break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  await writeFile(join(artifacts, 'console.json'), JSON.stringify(await client.execute(`return Services.console.getMessageArray().map(message => message.message);`), null, 2));
  if (!results) throw new Error('Thunderbird tests timed out.');
  results.push({ name: 'Synthetic SMTP captures only the five approved messages, including inline PNG MIME data', passed: mail.length === 5
    && mail.some(raw => /Subject: approved-warning/.test(raw))
    && mail.some(raw => /Subject: \[TLP:GREEN\] classified-send/.test(raw) && raw.includes('TLP:GREEN'))
    && mail.some(raw => /Subject: \[TLP:GREEN\] inline-image-send/.test(raw) && /Content-Type: image\/png/i.test(raw)
      && /Content-ID: <[^>]+>/i.test(raw) && /cid:/i.test(raw) && raw.includes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMC')) });
  const encrypted = mail.find(raw => /multipart\/encrypted/i.test(raw));
  const signed = mail.find(raw => /Subject: \[TLP:GREEN\] signed-send/.test(raw));
  const cryptoCheck = await client.command('WebDriver:ExecuteAsyncScript', {
    script: `const done = arguments[arguments.length - 1], encrypted = arguments[0], signed = arguments[1];
      (async () => {
        const { RNP } = ChromeUtils.importESModule('chrome://openpgp/content/modules/RNP.sys.mjs');
        const { EnigmailConstants } = ChromeUtils.importESModule('chrome://openpgp/content/modules/constants.sys.mjs');
        const armor = encrypted?.match(/-----BEGIN PGP MESSAGE-----[\\s\\S]*?-----END PGP MESSAGE-----/)?.[0];
        if (!armor || !signed) throw new Error('OpenPGP SMTP payload missing');
        const decrypted = await RNP.decrypt(armor, { fromAddr: 'sender@example.com' });
        const boundary = signed.match(/boundary="([^"]+)"/)?.[1];
        const parts = signed.split('--' + boundary + '\\r\\n');
        const data = parts[1]?.replace(/\\r\\n$/, '');
        const signature = signed.match(/-----BEGIN PGP SIGNATURE-----[\\s\\S]*?-----END PGP SIGNATURE-----/)?.[0];
        if (!data || !signature) throw new Error('Signed MIME data missing');
        const verified = await RNP.verifyDetached(data, signature, 'sender@example.com');
        return {
          encrypted: decrypted.exitCode === 0 && !!(decrypted.statusFlags & EnigmailConstants.DECRYPTION_OKAY)
            && !!(decrypted.statusFlags & EnigmailConstants.GOOD_SIGNATURE)
            && decrypted.decryptedData.includes('TLP:GREEN') && decrypted.decryptedData.includes('Synthetic encrypted message'),
          signed: verified.exitCode === 0 && !!(verified.statusFlags & EnigmailConstants.GOOD_SIGNATURE) && data.includes('TLP:GREEN'),
          flags: { decrypted: decrypted.statusFlags, verified: verified.statusFlags },
        };
      })().then(done, error => done({ error: String(error) }));`, args: [encrypted ?? '', signed ?? ''], newSandbox: true,
  });
  results.push({ name: 'Captured OpenPGP mail decrypts with an intact TLP body and valid signatures', passed: cryptoCheck.value?.encrypted === true && cryptoCheck.value?.signed === true, details: cryptoCheck.value });
  if (imapPort) {
    const remote = await readDrafts(imapPort);
    const armor = [...remote.matchAll(/-----BEGIN PGP MESSAGE-----[\s\S]*?-----END PGP MESSAGE-----/g)].at(-1)?.[0];
    const decoded = await client.command('WebDriver:ExecuteAsyncScript', {
      script: `const done = arguments[arguments.length - 1], armor = arguments[0];
        (async () => {
          const { RNP } = ChromeUtils.importESModule('chrome://openpgp/content/modules/RNP.sys.mjs');
          const value = await RNP.decrypt(armor, {});
          return { valid: value.exitCode === 0 && value.decryptedData.includes('TLP:AMBER') && value.decryptedData.includes('Synthetic IMAP draft body') };
        })().then(done, error => done({ error: String(error) }));`, args: [armor ?? ''], newSandbox: true,
    });
    results.push({ name: 'Independent IMAP read-back finds a marked encrypted draft that decrypts intact', passed: remote.includes('[TLP:AMBER] imap-draft-test') && decoded.value?.valid === true, details: decoded.value });
  }
  const packagePath = resolve(`release/tlp-mail-marker-thunderbird-${manifest.version}.xpi`);
  const installed = await client.command('WebDriver:ExecuteAsyncScript', {
    script: `const done = arguments[arguments.length - 1]; const path = arguments[0];
      (async () => {
        const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
        const old = await AddonManager.getAddonByID('{7d620cf4-26c5-499b-9a35-b6901f827b4a}'); await old.uninstall();
        const file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile); file.initWithPath(path);
        const install = await AddonManager.getInstallForFile(file); await install.install();
        const addon = await AddonManager.getAddonByID('{7d620cf4-26c5-499b-9a35-b6901f827b4a}');
        return { active: addon.isActive, temporary: addon.temporarilyInstalled, permissions: addon.userPermissions.permissions };
      })().then(done, error => done({ error: String(error) }));`,
    args: [packagePath], newSandbox: true,
  });
  results.push({ name: 'Unmodified production XPI installs permanently with only compose/storage permissions', passed: installed.value?.active === true && installed.value.temporary === false && JSON.stringify([...installed.value.permissions].sort()) === '["compose","storage"]', details: installed.value });
  const report = { version, platform: process.platform, results, smtpMessages: mail.length, profileIsolation: true, imapExecuted: !!imapPort };
  await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (results.some(result => !result.passed)) process.exitCode = 1;
  if (process.env.THUNDERBIRD_ACCEPTANCE_UI === '1' && !process.exitCode) {
    await client.execute(`
      const { MailServices } = ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
      const params = Cc['@mozilla.org/messengercompose/composeparams;1'].createInstance(Ci.nsIMsgComposeParams);
      params.identity = MailServices.accounts.defaultAccount.defaultIdentity;
      params.type = Ci.nsIMsgCompType.New; params.format = Ci.nsIMsgCompFormat.PlainText;
      params.composeFields = Cc['@mozilla.org/messengercompose/composefields;1'].createInstance(Ci.nsIMsgCompFields);
      params.composeFields.to = 'recipient@example.com'; params.composeFields.subject = 'Manual beta UI'; params.composeFields.body = 'Synthetic toolbar and keyboard acceptance message';
      MailServices.compose.OpenComposeWindowWithParams(null, params); return true;
    `);
    console.log('ACCEPTANCE_UI_READY. Create tests/thunderbird/artifacts/ui-done to finish.');
    // Keep only this isolated test app and synthetic SMTP alive for native UI checks.
    const { access } = await import('node:fs/promises');
    for (let i = 0; i < 600; i++) {
      try { await access(join(artifacts, 'ui-done')); break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    await writeFile(join(artifacts, 'ui-smtp.json'), JSON.stringify(mail.slice(5), null, 2));
  }
} catch (error) { console.error(error); process.exitCode = 1; }
finally {
  try { await client?.execute('Services.startup.quit(Services.startup.eForceQuit);'); } catch {}
  client?.close();
  processApp.kill('SIGTERM');
  for (const socket of sockets) socket.destroy(); smtp.close();
  await writeFile(join(artifacts, 'runtime.log'), log);
  console.log(`Runtime artifacts: ${artifacts}`);
}
