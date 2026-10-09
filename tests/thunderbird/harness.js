/* This file is copied into a TEMPORARY test add-on. It is never packaged. */
const api = messenger;
const results = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };
const command = async message => {
  const reply = await api.runtime.sendMessage(message);
  if (reply?.error) throw new Error(reply.error);
  return reply;
};
async function test(name, run) {
  try { await Promise.race([run(), pause(15000).then(() => { throw new Error('Native test timed out'); })]); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) + '\n' + (error.stack ?? '') }); }
  console.log('TLP_TEST_PROGRESS ' + JSON.stringify(results.at(-1)));
  api.testReporter.report('progress', JSON.stringify(results.at(-1)));
  if (!results.at(-1).passed) throw new Error('Stopping after failed native test');
}
async function compose(details) {
  const tab = await api.compose.beginNew({ to: ['recipient@example.com'], subject: 'Synthetic test', ...details });
  // Native onCreated and editor initialization are asynchronous.
  await pause(300);
  return tab;
}
async function apply(tab, level, confirmed = false) {
  return command({ action: 'apply', tabId: tab.id, level, confirmed });
}
async function close(tab) { await api.tabs.remove(tab.id); }
async function cancelled(send) {
  // Thunderbird 140's compose.sendMessage can leave its promise pending when
  // onBeforeSend cancels. Check that the composer is unlocked and remains open;
  // the runner independently checks the SMTP capture contains no cancelled mail.
  for (let i = 0; i < 100; i++) {
    if (await api.testReporter.composersUnlocked()) {
      const result = await Promise.race([send, pause(200).then(() => ({ sent: false }))]);
      assert(!result.sent, 'Cancelled message sent'); return;
    }
    await pause(50);
  }
  throw new Error('Cancelled send did not release the native composer');
}
async function pendingReview(tab) {
  const send = api.compose.sendMessage(tab.id, { mode: 'sendNow' }).then(value => ({ sent: true, value }), error => ({ sent: false, error: String(error) }));
  for (let i = 0; i < 100; i++) {
    const windows = await api.windows.getAll({ populate: true });
    for (const window of windows) for (const candidate of window.tabs ?? []) {
      if (candidate.url?.startsWith(api.runtime.getURL('review.html?'))) {
        const token = new URL(candidate.url).searchParams.get('token');
        return { token, window, send, review: await command({ action: 'review', token }) };
      }
    }
    await pause(50);
  }
  throw new Error('Native send did not open a review window');
}
async function run() {
  await api.storage.local.set({ settings: { enabled: true, defaultLevel: null, missingClassification: 'warn', markSubject: true, markBody: true, warnOnDowngrade: true } });
  await test('Native plain-text composer: marking is idempotent and preserves recipients and signature', async () => {
    const tab = await compose({ isPlainText: true, plainTextBody: 'Synthetic body\n\n-- \nSignature' });
    await apply(tab, 'TLP:AMBER'); await apply(tab, 'TLP:AMBER');
    const details = await api.compose.getComposeDetails(tab.id);
    assert(details.subject === '[TLP:AMBER] Synthetic test', 'Subject was not marked exactly once');
    assert(details.plainTextBody.includes('Synthetic body') && details.plainTextBody.includes('Signature'), 'Message content changed');
    assert((details.plainTextBody.match(/TLP:AMBER/g) ?? []).length === 1, 'Body marking duplicated');
    assert(details.to.some(recipient => recipient.includes('recipient@example.com')), 'Recipient changed');
    await close(tab);
  });
  await test('Native HTML composer: quotes, signature, and attachments survive', async () => {
    const tab = await compose({ isPlainText: false, body: '<p>Synthetic HTML</p><blockquote type="cite">Quoted text</blockquote><div class="moz-signature">Signature</div>' });
    await api.compose.addAttachment(tab.id, { file: new File(['synthetic attachment'], 'evidence.txt', { type: 'text/plain' }) });
    await apply(tab, 'TLP:GREEN'); await apply(tab, 'TLP:GREEN');
    const details = await api.compose.getComposeDetails(tab.id);
    assert(details.body.includes('Synthetic HTML') && details.body.includes('Quoted text') && details.body.includes('Signature'), 'HTML content lost');
    assert(details.body.includes('blockquote'), 'Quote structure lost');
    assert((await api.compose.listAttachments(tab.id))[0]?.name === 'evidence.txt', 'Attachment lost');
    await close(tab);
  });
  await test('Independent composers keep separate classifications', async () => {
    const a = await compose({ isPlainText: true, plainTextBody: 'First' });
    const b = await compose({ isPlainText: true, plainTextBody: 'Second' });
    await apply(a, 'TLP:RED'); await apply(b, 'TLP:CLEAR');
    assert((await command({ action: 'state', tabId: a.id })).selected === 'TLP:RED', 'First composer context changed');
    assert((await command({ action: 'state', tabId: b.id })).selected === 'TLP:CLEAR', 'Second composer context changed');
    await close(a); await close(b);
  });
  await test('Missing classification: closing review cancels native send', async () => {
    const tab = await compose({ isPlainText: true, plainTextBody: 'Cancel this synthetic message' });
    const review = await pendingReview(tab);
    assert(review.review.issues.length > 0, 'No missing-classification warning');
    await api.windows.remove(review.window.id);
    await cancelled(review.send);
    await close(tab);
  });
  await test('Missing classification: one explicit approval releases native SMTP send', async () => {
    const tab = await compose({ isPlainText: true, plainTextBody: 'Approved synthetic warning', subject: 'approved-warning' });
    const review = await pendingReview(tab);
    assert(review.review.canContinue, 'Warning cannot be approved');
    const decision = await command({ action: 'decide', token: review.token, proceed: true });
    assert(!decision.changed, 'Unchanged message considered changed');
    assert((await review.send).sent, 'Approved native send failed');
  });
  await test('Blocked policy cannot be bypassed by review approval', async () => {
    const settings = (await api.storage.local.get('settings')).settings;
    await api.storage.local.set({ settings: { ...settings, missingClassification: 'block' } });
    const tab = await compose({ isPlainText: true, plainTextBody: 'Blocked synthetic message' });
    const review = await pendingReview(tab);
    assert(!review.review.canContinue, 'Block policy allows continuing');
    assert((await command({ action: 'decide', token: review.token, proceed: true })).changed, 'Blocking policy bypassed');
    await command({ action: 'decide', token: review.token, proceed: false });
    await cancelled(review.send);
    await close(tab);
    await api.storage.local.set({ settings });
  });
  await test('Correctly marked message sends through native SMTP without a review', async () => {
    const tab = await compose({ isPlainText: true, plainTextBody: 'Approved synthetic classified message', subject: 'classified-send' });
    await apply(tab, 'TLP:GREEN');
    await api.compose.sendMessage(tab.id, { mode: 'sendNow' });
  });
  await test('Inline PNG survives repeated HTML marking and real SMTP delivery', async () => {
    const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
    const tab = await compose({ isPlainText: false, subject: 'inline-image-send',
      body: `<p>Synthetic inline image</p><img alt="Synthetic pixel" src="data:image/png;base64,${image}"><div class="moz-signature">Signature</div>` });
    await apply(tab, 'TLP:GREEN'); await apply(tab, 'TLP:GREEN');
    const details = await api.compose.getComposeDetails(tab.id);
    assert(details.body.includes('Synthetic pixel') && details.body.includes('moz-signature'), 'Inline image or signature removed');
    await api.compose.sendMessage(tab.id, { mode: 'sendNow' });
  });
  for (const encryptBody of [false, true]) await test(`Native OpenPGP ${encryptBody ? 'encrypted and signed' : 'signed'} message preserves markings`, async () => {
    const tab = await compose({ isPlainText: true, subject: encryptBody ? 'encrypted-send' : 'signed-send',
      plainTextBody: encryptBody ? 'Synthetic encrypted message' : 'Synthetic signed message' });
    await api.compose.setComposeDetails(tab.id, { selectedEncryptionTechnology: { name: 'OpenPGP', encryptBody, encryptSubject: false, signMessage: true } });
    await apply(tab, 'TLP:GREEN');
    const details = await api.compose.getComposeDetails(tab.id);
    assert(details.selectedEncryptionTechnology?.encryptBody === encryptBody && details.selectedEncryptionTechnology?.signMessage, 'Marking changed encryption settings');
    await api.compose.sendMessage(tab.id, { mode: 'sendNow' });
  });
  await test('A profile changing approved levels blocks a composer already open', async () => {
    const settings = (await api.storage.local.get('settings')).settings;
    const tab = await compose({ isPlainText: true, plainTextBody: 'Restricted synthetic draft' });
    await apply(tab, 'TLP:RED');
    await api.storage.local.set({ settings: { ...settings, allowedLevels: ['TLP:GREEN'], defaultLevel: null } });
    const review = await pendingReview(tab);
    assert(!review.review.canContinue && review.review.issues.some(issue => issue.code === 'LEVEL_NOT_ALLOWED'), 'Old selection bypassed new profile');
    await command({ action: 'decide', token: review.token, proceed: false });
    await cancelled(review.send); await close(tab);
    await api.storage.local.set({ settings });
  });
  await test('Saved draft reopens with its classification', async () => {
    const tab = await compose({ isPlainText: true, plainTextBody: 'Synthetic draft', subject: 'draft-test' });
    await apply(tab, 'TLP:AMBER+STRICT');
    const saved = await api.compose.saveMessage(tab.id, { mode: 'draft' });
    await close(tab);
    assert(saved.messages?.[0]?.id, 'Native draft was not saved');
    const reopened = await api.compose.beginNew(saved.messages[0].id);
    await pause(300);
    assert((await command({ action: 'state', tabId: reopened.id })).selected === 'TLP:AMBER+STRICT', 'Draft classification not restored');
    await apply(reopened, 'TLP:AMBER+STRICT');
    assert((await api.compose.getComposeDetails(reopened.id)).subject === '[TLP:AMBER+STRICT] draft-test', 'Reopened draft duplicated marking');
    await close(reopened);
  });
  if (await api.testReporter.imapDrafts(true)) {
    await test('Encrypted IMAP draft saves remotely and reopens with its classification and body', async () => {
      const tab = await compose({ isPlainText: true, plainTextBody: 'Synthetic IMAP draft body', subject: 'imap-draft-test' });
      await apply(tab, 'TLP:AMBER');
      const saved = await api.compose.saveMessage(tab.id, { mode: 'draft' });
      assert(saved.messages?.[0]?.id, 'IMAP draft not saved');
      const source = await api.messages.getRaw(saved.messages[0].id);
      const raw = typeof source === 'string' ? source : await source.text();
      assert(raw.includes('[TLP:AMBER] imap-draft-test') && raw.includes('-----BEGIN PGP MESSAGE-----'), 'Encrypted IMAP draft content missing');
      await close(tab);
      const reopened = await api.compose.beginNew(saved.messages[0].id); await pause(300);
      assert((await command({ action: 'state', tabId: reopened.id })).selected === 'TLP:AMBER', 'Reopened IMAP draft lost classification');
      assert((await api.compose.getComposeDetails(reopened.id)).plainTextBody.includes('Synthetic IMAP draft body'), 'Reopened IMAP draft lost content');
      await close(reopened);
    });
    await api.testReporter.imapDrafts(false);
  }
  await test('Reply and forward retain the source classification without quoted text', async () => {
    const original = await compose({ isPlainText: true, plainTextBody: 'Synthetic original', subject: 'source-test' });
    await apply(original, 'TLP:RED');
    const saved = await api.compose.saveMessage(original.id, { mode: 'draft' });
    await close(original);
    for (const tab of [
      await api.compose.beginReply(saved.messages[0].id, 'replyToSender', { subject: 'Reply', plainTextBody: 'No original quote' }),
      await api.compose.beginForward(saved.messages[0].id, 'forwardInline', { subject: 'Forward', plainTextBody: 'No original quote' }),
    ]) {
      await pause(300);
      const state = await command({ action: 'state', tabId: tab.id });
      assert(state.original === 'TLP:RED' && state.selected === 'TLP:RED', 'Source classification was not inherited');
      assert((await apply(tab, 'TLP:CLEAR')).needsConfirmation, 'Source downgrade did not require confirmation');
      await close(tab);
    }
  });
  await test('Native Send Later validates and queues a marked message', async () => {
    const tab = await compose({ isPlainText: true, plainTextBody: 'Synthetic queued message', subject: 'queued-test' });
    await apply(tab, 'TLP:GREEN');
    const queued = await api.compose.sendMessage(tab.id, { mode: 'sendLater' });
    assert(queued.mode === 'sendLater' && queued.messages?.[0]?.subject === '[TLP:GREEN] queued-test', 'Queued message was not marked');
  });
  await test('Default classification marks new messages automatically', async () => {
    const settings = (await api.storage.local.get('settings')).settings;
    await api.storage.local.set({ settings: { ...settings, defaultLevel: 'TLP:CLEAR' } });
    const tab = await compose({ isPlainText: true, plainTextBody: 'Default test', subject: 'default-test' });
    const details = await api.compose.getComposeDetails(tab.id);
    assert(details.subject === '[TLP:CLEAR] default-test' && details.plainTextBody.startsWith('TLP:CLEAR'), 'Default was not automatically applied');
    await close(tab);
    await api.storage.local.set({ settings });
  });
  console.log('TLP_TEST_RESULT ' + JSON.stringify(results));
  api.testReporter.report('result', JSON.stringify(results));
}
run().catch(error => { results.push({ name: 'Harness', passed: false, error: String(error) }); api.testReporter.report('result', JSON.stringify(results)); });
