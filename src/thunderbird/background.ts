import { mailApi } from './api.js';
import { ThunderbirdController } from './controller.js';

const api = mailApi();
const controller = new ThunderbirdController(api);
api.compose.onBeforeSend.addListener((tab, details) => controller.beforeSend(tab, details));
api.tabs.onCreated.addListener(tab => { void controller.initialize(tab); });
api.tabs.onRemoved.addListener(id => { void controller.tabClosed(id); });
api.windows.onRemoved.addListener(id => controller.windowClosed(id));
api.runtime.onMessage.addListener(async (message, sender) => {
  if (sender.id !== api.runtime.id || !sender.url?.startsWith(api.runtime.getURL(''))) return undefined;
  try {
    if (message?.action === 'state' && Number.isInteger(message.tabId)) return await controller.state(message.tabId);
    if (message?.action === 'apply' && Number.isInteger(message.tabId)) return await controller.apply(message.tabId, message.level, message.confirmed === true);
    if (message?.action === 'review' && typeof message.token === 'string') {
      if (sender.url === api.runtime.getURL(`review.html?token=${message.token}`) && Number.isInteger(message.windowId)) controller.bindReview(message.token, message.windowId);
      return controller.review(message.token);
    }
    if (message?.action === 'decide' && typeof message.token === 'string') return await controller.decide(message.token, message.proceed === true);
  } catch { return { error: 'Unable to complete this action. Return to the composer and try again.' }; }
  return undefined;
});
