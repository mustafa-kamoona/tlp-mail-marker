import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { connect } from '../thunderbird/marionette.mjs';
import { inject, messages } from './imap.mjs';

// Test the unmodified production package with a disposable Firefox profile.
const binary = process.env.FIREFOX_BINARY;
if (!binary) throw new Error('Set FIREFOX_BINARY to a Firefox 140+ executable.');
const base = process.env.ROUNDCUBE_URL ?? 'http://127.0.0.1:8081';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Use a synthetic loopback Roundcube fixture.');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const archive = resolve(`release/tlp-mail-marker-firefox-${pkg.version}.zip`);
const scratch = await mkdtemp(join(tmpdir(), 'tlp-firefox-'));
const profile = join(scratch, 'profile');
const downloads = join(scratch, 'downloads');
const artifacts = resolve(process.env.FIREFOX_ARTIFACTS ?? 'tests/firefox/artifacts');
await mkdir(profile); await mkdir(downloads); await mkdir(artifacts, { recursive: true });
const server = net.createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
await writeFile(join(profile, 'user.js'), Object.entries({
  'marionette.enabled': true, 'marionette.port': port,
  'browser.shell.checkDefaultBrowser': false, 'browser.startup.page': 0,
  'browser.startup.homepage': 'about:blank', 'browser.warnOnQuitShortcut': false,
  'browser.sessionstore.resume_from_crash': false,
  'browser.download.folderList': 2, 'browser.download.dir': downloads,
  'browser.download.useDownloadDir': true, 'browser.download.alwaysOpenPanel': false,
  'app.update.auto': false, 'extensions.update.enabled': false,
  'datareporting.healthreport.uploadEnabled': false,
  'datareporting.policy.dataSubmissionEnabled': false, 'toolkit.telemetry.enabled': false,
}).map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`).join('\n'));
const app = spawn(binary, ['-no-remote', '-profile', profile, '-marionette', '-headless', '--remote-allow-system-access'], {
  env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '', client, origin, version;
app.stdout.on('data', chunk => { log += chunk; }); app.stderr.on('data', chunk => { log += chunk; });
app.on('error', error => { log += error.stack; });
const results = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
async function scenario(id, fn) {
  const started = Date.now();
  try { await fn(); results.push({ id, passed: true, durationMs: Date.now() - started }); console.log(`PASS ${id}`); }
  catch (error) { results.push({ id, passed: false, error: String(error) }); console.log(`FAIL ${id}: ${error}`); }
}
async function execute(script, args = [], context = 'content', async = false) {
  await client.command('Marionette:SetContext', { value: context });
  const response = await client.command(async ? 'WebDriver:ExecuteAsyncScript' : 'WebDriver:ExecuteScript', { script, args, newSandbox: true });
  return response.value;
}
async function wait(script, args = [], context = 'content') {
  for (let i = 0; i < 100; i++) { if (await execute(script, args, context)) return; await delay(100); }
  throw new Error(`Timed out: ${script}`);
}
async function go(url) {
  await client.command('Marionette:SetContext', { value: 'content' });
  await client.command('WebDriver:Navigate', { url });
}
async function click(selector) {
  await client.command('Marionette:SetContext', { value: 'content' });
  const found = await client.command('WebDriver:FindElement', { using: 'css selector', value: selector });
  await client.command('WebDriver:ElementClick', { id: found.value['element-6066-11e4-a52e-4f735466cecf'] });
}
async function doubleClick(selector) {
  const found = await client.command('WebDriver:FindElement', { using: 'css selector', value: selector });
  await client.command('WebDriver:PerformActions', { actions: [{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[
    {type:'pointerMove',duration:0,origin:found.value,x:0,y:0},
    {type:'pointerDown',button:0},{type:'pointerUp',button:0},{type:'pause',duration:100},
    {type:'pointerDown',button:0},{type:'pointerUp',button:0},
  ]}] });
}
async function api(script, args = []) {
  const result = await execute(`const api = window.chrome;
    const done = arguments[arguments.length - 1];
    (async () => { ${script} })().then(done, error => done({testError: String(error)}));`, args, 'content', true);
  if (result?.testError) throw new Error(result.testError);
  return result;
}
async function waitApi(script) {
  let value;
  for (let i=0;i<100;i++) {
    value=await api(script);
    if(value) return value;
    await delay(100);
  }
  throw new Error(`Timed out waiting for browser API state: ${script}`);
}
const defaults = { enabled: true, domains: [{ host: new URL(base).host, enabled: true }],
  missingClassification: 'warn', warnOnDowngrade: true, markSubject: true,
  markBody: true, colorCoding: true, theme: 'auto', version: 1 };
async function settings(value = defaults) {
  await go(`${origin}/options.html`);
  await api('await api.storage.local.set({settings: arguments[0]}); await api.runtime.sendMessage({type:"tlp:reconcile", reason:"test"});', [value]);
  await delay(300);
}
async function compose(params = '', authorized = true) {
  await go(`${base}/?_task=mail&_action=compose&_framed=1${params}`);
  await wait('return !!document.querySelector("#composebody");');
  if (authorized) await wait('return !!document.querySelector(".tlp-mail-marker-ui")?.shadowRoot;');
}
async function fill(subject, body, to = 'test@example.com') {
  await execute(`for (const [selector, value] of [['#compose-subject',arguments[0]],['#composebody',arguments[1]],['[name="_to"]',arguments[2]]]) {
    const el=document.querySelector(selector); el.value=value; el.dispatchEvent(new Event('input',{bubbles:true}));
  }`, [subject, body, to]);
}
async function select(level) {
  await execute(`const input=document.querySelector('.tlp-mail-marker-ui').shadowRoot.querySelector('input[value="'+arguments[0]+'"]');
    if(!input) throw new Error('Missing level '+arguments[0]); input.checked=true; input.dispatchEvent(new Event('change',{bubbles:true}));`, [level]);
  await delay(100);
}
const marked = () => execute(`return {subject:document.querySelector('#compose-subject').value, body:document.querySelector('#composebody').value,
  selected:document.querySelector('.tlp-mail-marker-ui')?.shadowRoot.querySelector('input:checked')?.value};`);
const dialog = () => execute(`return document.querySelector('.tlp-modal-host')?.shadowRoot.textContent ?? '';`);

try {
  for (let i = 0; i < 100; i++) {
    if (app.exitCode !== null) throw new Error(`Firefox exited: ${log}`);
    try { client = await connect(port); break; } catch { await delay(200); }
  }
  if (!client) throw new Error(`Firefox automation unavailable: ${log}`);
  version = await execute('return Services.appinfo.version;', [], 'chrome');
  console.log(`Firefox ${version}: unmodified production ZIP`);
  const install = await execute(`const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const file=Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile); file.initWithPath(arguments[0]);
    const done=arguments[arguments.length-1]; AddonManager.installTemporaryAddon(file).then(a=>done({id:a.id,active:a.isActive}),e=>done({error:String(e)}));`, [archive], 'chrome', true);
  assert(install.active && install.id === 'tlp-mail-marker@mustafa-kamoona', JSON.stringify(install));
  origin = await execute(`return 'moz-extension://'+JSON.parse(Services.prefs.getStringPref('extensions.webextensions.uuids'))[arguments[0]];`, [install.id], 'chrome');
  await go(`${origin}/options.html`);
  await wait('return document.querySelectorAll("#allowed-levels input").length===5;');
  await scenario('production-manifest-and-api', async () => {
    const m = await api('return api.runtime.getManifest();');
    assert(m.background.scripts[0].endsWith('background.js') && !m.background.service_worker && !m.content_scripts?.length,
      `Firefox event background and production injection: ${JSON.stringify({background:m.background,content_scripts:m.content_scripts})}`);
    assert(m.browser_specific_settings.gecko.data_collection_permissions.required[0] === 'none', 'No data collection declared');
    assert((await api('return api.permissions.getAll();')).origins.length === 0, 'No host access on install');
    assert((await api('return api.scripting.getRegisteredContentScripts();')).length === 0, 'No scripts registered before consent');
  });
  await scenario('host-permission-through-options', async () => {
    await execute('document.querySelector("#domain-input").value=arguments[0];', [new URL(base).host]);
    await click('#domain-add');
    await wait(`return !!Services.wm.getMostRecentWindow('navigator:browser').PopupNotifications.panel.querySelector('popupnotification');`, [], 'chrome');
    await execute(`Services.wm.getMostRecentWindow('navigator:browser').PopupNotifications.panel.querySelector('popupnotification').button.click();`, [], 'chrome');
    await wait(`return document.querySelector('#domain-status').textContent.includes('added');`);
    // The options confirmation is rendered before asynchronous reconciliation ends.
    // Observe completion without sending an extra reconcile that could conceal a failure.
    await waitApi('const scripts=await api.scripting.getRegisteredContentScripts(); return scripts.length===2 && scripts.some(s=>s.world==="MAIN");');
  });
  assert(results.at(-1).passed, 'Host authorization is required for the remaining scenarios');
  await settings();
  await go(base);
  await execute(`document.querySelector('#rcmloginuser').value='test@example.com'; document.querySelector('#rcmloginpwd').value='test';`);
  await click('button[type="submit"], input[type="submit"]');
  // The login URL can already contain _task=mail while authentication/navigation
  // is still pending. Wait for the authenticated inbox before opening a composer.
  await wait('return !!document.querySelector("#messagelist") && !document.querySelector("#rcmloginuser");');
  await scenario('selector-and-main-world-probe', async () => {
    await compose();
    assert(await execute(`return document.querySelectorAll('.tlp-mail-marker-ui').length===1 && document.documentElement.getAttribute('data-tlp-env-ready')==='1';`), 'One selector and page environment available');
  });
  await scenario('all-five-levels-and-idempotence', async () => {
    await compose();
    await fill('Synthetic Firefox', 'مرحبا بالعالم\nשלום עולם\nSynthetic content');
    for (const level of ['TLP:CLEAR','TLP:GREEN','TLP:AMBER','TLP:AMBER+STRICT','TLP:RED','TLP:RED']) {
      await select(level); const m = await marked();
      assert(m.subject.startsWith(`[${level}]`) && m.body.startsWith(level), `Marks ${level}`);
      assert((m.subject.match(/TLP:/g)??[]).length === 1 && (m.body.match(/TLP:/g)??[]).length === 1 && m.body.includes('مرحبا بالعالم'), 'One mark; Unicode preserved');
    }
  });
  await scenario('html-editor', async () => {
    await compose(); await fill('HTML Firefox', 'Synthetic rich text');
    await execute(`window.rcmail.env.editor_warned=true; window.rcmail.editor.toggle(true);`);
    await wait(`return !!document.querySelector('iframe#composebody_ifr,iframe.tox-edit-area__iframe')?.contentDocument?.body;`);
    await delay(1000); await select('TLP:AMBER');
    assert(await execute(`const b=document.querySelector('iframe#composebody_ifr,iframe.tox-edit-area__iframe').contentDocument.body;
      return b.querySelectorAll('.tlp-mail-marker').length===1 && b.textContent.includes('TLP:AMBER') && b.textContent.includes('Synthetic rich text');`), 'HTML content marked and preserved');
  });
  await scenario('draft-save-and-reopen', async () => {
    await compose(); await fill('Firefox draft', 'Firefox draft body'); await select('TLP:GREEN');
    await click('.save.draft'); await delay(2000);
    await go(`${base}/?_task=mail&_mbox=Drafts`);
    await wait(`return !!document.querySelector('#messagelist tr.message');`);
    await doubleClick('#messagelist tr.message');
    await wait('return !!document.querySelector("#composebody") && !!document.querySelector(".tlp-mail-marker-ui")?.shadowRoot;');
    const m = await marked(); assert(m.selected === 'TLP:GREEN' && m.body.includes('Firefox draft body'), `Draft classification and content restored: ${JSON.stringify(m)}`);
  });
  await scenario('reply-inheritance-and-downgrade-review', async () => {
    const uid = await inject('[TLP:RED] Firefox source', 'TLP:RED\r\n\r\nSynthetic restricted text');
    await compose(`&_reply_uid=${uid}&_mbox=INBOX`);
    await wait(`return document.querySelector('.tlp-mail-marker-ui').shadowRoot.querySelector('input:checked')?.value==='TLP:RED';`);
    await select('TLP:GREEN'); await click('.send');
    await wait('return !!document.querySelector(".tlp-modal-host");');
    assert(/Lower|warnings/.test(await dialog()), 'Downgrade review displayed');
  });
  await scenario('forward-inheritance', async () => {
    const uid = await inject('[TLP:AMBER+STRICT] Firefox forward', 'TLP:AMBER+STRICT\r\n\r\nSynthetic forwarding content');
    await compose(`&_forward_uid=${uid}&_forward_inline=1&_mbox=INBOX`);
    await wait(`return document.querySelector('.tlp-mail-marker-ui').shadowRoot.querySelector('input:checked')?.value==='TLP:AMBER+STRICT';`);
    assert((await marked()).body.includes('Synthetic forwarding content'), 'Forward content preserved');
  });
  await scenario('quoted-restriction-review', async () => {
    const uid = await inject('[TLP:GREEN] Firefox quote', 'TLP:GREEN\r\n\r\nCommunity text\r\n> TLP:RED\r\n> Synthetic restricted quote');
    await compose(`&_reply_uid=${uid}&_mbox=INBOX`); await click('.send');
    await wait('return !!document.querySelector(".tlp-modal-host");');
    assert((await dialog()).includes('more restrictive') && (await dialog()).includes('TLP:RED'), 'Quoted restriction review displayed');
  });
  const blockedSubject = `Firefox-blocked-${Date.now()}`;
  await scenario('missing-classification-block-and-no-delivery', async () => {
    await settings({...defaults,missingClassification:'block'}); await compose(); await fill(blockedSubject,'Unclassified synthetic text');
    await click('.send'); await wait('return !!document.querySelector(".tlp-modal-host");');
    assert(/not sent|classification required/.test(await dialog()), 'Missing classification blocked');
    await delay(500); assert(!(await messages()).includes(blockedSubject), 'Blocked message absent from mailbox');
  });
  await scenario('classified-delivery', async () => {
    await settings(); await compose();
    const subject = `Firefox-delivered-${Date.now()}`; await fill(subject,'Synthetic delivery body'); await select('TLP:AMBER+STRICT');
    await click('.send');
    let received = '';
    for (let i=0;i<30;i++) { received=await messages(); if(received.includes(subject)) break; await delay(200); }
    assert(received.includes(`[TLP:AMBER+STRICT] ${subject}`) && /TLP:AMBER\+STRICT[\s\S]*Synthetic delivery body/.test(received), 'Delivered mail contains subject and body marks');
  });
  await scenario('organisation-profile-preview-and-apply', async () => {
    await go(`${origin}/options.html`); await wait('return document.querySelectorAll("#allowed-levels input").length===5;');
    const team = {format:'tlp-mail-marker-profile',version:1,name:'Firefox team',settings:{allowedLevels:['TLP:GREEN','TLP:AMBER'],defaultLevel:'TLP:AMBER',missingClassification:'block'}};
    await execute(`const transfer=new DataTransfer(); transfer.items.add(new File([arguments[0]],'team.json',{type:'application/json'}));
      const input=document.querySelector('#profile-file'); input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));`, [JSON.stringify(team)]);
    await wait('return !document.querySelector("#profile-apply").disabled;');
    assert((await api('return (await api.storage.local.get("settings")).settings;')).missingClassification==='warn', 'Preview leaves settings unchanged');
    await click('#profile-apply'); await wait('return document.querySelector("#profile-status").textContent.includes("Applied Firefox team");');
    const s=await api('return (await api.storage.local.get("settings")).settings;');
    assert(s.defaultLevel==='TLP:AMBER' && s.allowedLevels.join(',')==='TLP:GREEN,TLP:AMBER' && s.domains[0].host===new URL(base).host, 'Shared rules applied; domains retained');
    await execute(`document.querySelector('#profile-name').value='Firefox export';`);
    await click('#profile-export');
    let exported;
    for (let i=0;i<50;i++) {
      try { exported=JSON.parse(await readFile(join(downloads,'tlp-organisation-profile.json'),'utf8')); break; } catch { await delay(100); }
    }
    assert(exported?.name==='Firefox export' && JSON.stringify(exported.settings)===JSON.stringify(team.settings), 'Actual downloaded profile contains the shared rules');
    await execute(`const transfer=new DataTransfer(); transfer.items.add(new File(['{"version":99}'],'bad.json',{type:'application/json'}));
      const input=document.querySelector('#profile-file'); input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));`);
    await wait('return document.querySelector("#profile-status").textContent.length>0;');
    assert(await execute('return document.querySelector("#profile-apply").disabled;'), 'Malformed profile rejected');
    assert(JSON.stringify(await api('return (await api.storage.local.get("settings")).settings;'))===JSON.stringify(s), 'Rejected import leaves settings unchanged');
    await compose(); assert((await marked()).selected==='TLP:AMBER', 'Default applies to composer');
  });
  await scenario('multiple-compose-tabs', async () => {
    await settings(); await compose(); await select('TLP:RED');
    const first = (await client.command('WebDriver:GetWindowHandle')).value;
    const second = await client.command('WebDriver:NewWindow',{type:'tab'});
    await client.command('WebDriver:SwitchToWindow',{handle:second.handle ?? second.value.handle});
    await compose(); await select('TLP:GREEN');
    assert((await marked()).selected==='TLP:GREEN', 'Second composer has its own level');
    await client.command('WebDriver:CloseWindow');
    await client.command('WebDriver:SwitchToWindow',{handle:first});
    assert((await marked()).selected==='TLP:RED', 'First composer retains its level');
  });
  await scenario('unsupported-interface', async () => {
    await go(`${base}/?_task=mail&_mbox=INBOX`); await delay(500);
    assert(await execute('return !document.querySelector(".tlp-mail-marker-ui");'), 'No selector outside a composer');
  });
  await scenario('popup-page', async () => {
    await go(`${origin}/popup.html`); await wait('return document.body.textContent.includes("AMBER+STRICT");');
  });
  await scenario('disable-unregisters-scripts', async () => {
    await settings({...defaults,enabled:false});
    assert((await api('return api.scripting.getRegisteredContentScripts();')).length===0, 'Disabled extension unregisters scripts');
    await compose('',false); await delay(500);
    assert(await execute('return !document.querySelector(".tlp-mail-marker-ui");'), 'Disabled extension absent from new composer');
  });
  await scenario('permission-revocation', async () => {
    await settings();
    await api('await api.permissions.remove({origins:["http://127.0.0.1/*","https://127.0.0.1/*"]});'); await delay(300);
    assert((await api('return api.scripting.getRegisteredContentScripts();')).length===0, 'Revoking host access unregisters scripts');
    await compose('',false); await delay(500);
    assert(await execute('return !document.querySelector(".tlp-mail-marker-ui");'), 'No new injection after revocation');
  });
} catch (error) { results.push({id:'harness',passed:false,error:String(error)}); console.error(error); }
finally {
  const report={generatedAt:new Date().toISOString(),firefoxVersion:version,package:archive,roundcubeUrl:base,
    summary:{total:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length},scenarios:results};
  await writeFile(join(artifacts,'report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(join(artifacts,'firefox.log'),log);
  console.log(report.summary);
  if(client) { await client.command('Marionette:Quit',{flags:['eForceQuit']}).catch(()=>{}); client.close(); }
  app.kill(); await rm(scratch,{recursive:true,force:true});
  if(report.summary.failed) process.exitCode=1;
}
