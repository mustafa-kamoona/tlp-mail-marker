import { mailApi } from './api.js';
import { showIssues, status } from './ui.js';
const api = mailApi();
const token = new URLSearchParams(location.search).get('token');
const send = document.getElementById('send') as HTMLButtonElement;
async function decide(proceed: boolean) {
  send.disabled = true;
  const response = await api.runtime.sendMessage({ action: 'decide', token, proceed });
  if (response?.error) throw new Error(response.error);
  if (response?.changed) status('The message or settings changed. Go back and send again for a fresh review.');
}
send.addEventListener('click', () => { void decide(true).catch(error => status(error.message)); });
document.getElementById('back')!.addEventListener('click', () => { void decide(false).catch(error => status(error.message)); });
void (async () => {
  const window = await api.windows.getCurrent();
  const review = await api.runtime.sendMessage({ action: 'review', token, windowId: window.id });
  if (!review || review.error) throw new Error(review?.error ?? 'This review has expired. Return to the composer.');
  showIssues(document.getElementById('issues')!, review.issues);
  send.hidden = !review.canContinue;
  if (!review.canContinue) {
    document.getElementById('heading')!.textContent = 'Fix the TLP markings';
    document.getElementById('explanation')!.textContent = 'This message cannot be sent until the listed issues are fixed. Open TLP classification in the compose toolbar.';
  }
  document.getElementById('back')!.focus();
})().catch(error => status(error.message));
