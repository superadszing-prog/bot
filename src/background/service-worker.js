/**
 * Background service worker: routes messages between the popup and the
 * active content script, and centralizes permission checks/logging.
 */
importScripts('../utils/logger.js');

const logger = self.AIBotLogger.createLogger('background');

chrome.runtime.onInstalled.addListener(() => {
  logger.info('AI Bot extension installed');
});

/**
 * Message contract:
 *  { type: 'RUN_COMMAND', command: string }        -> forwarded to active tab's content script
 *  { type: 'GET_STATUS' }                            -> replies with last known status per tab
 *  { type: 'STATUS_UPDATE', status: object }          -> from content script, cached for popup
 */
const tabStatus = new Map();

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStatus.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tabStatus.delete(tabId);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === 'RUN_COMMAND') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        sendResponse({ ok: false, error: 'ไม่พบแท็บที่ใช้งานอยู่' });
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'RUN_COMMAND', command: message.command }, (response) => {
        if (chrome.runtime.lastError) {
          logger.error('Failed to forward command', chrome.runtime.lastError.message);
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse(response || { ok: true });
      });
    });
    return true; // keep the message channel open for async sendResponse
  }

  if (message.type === 'STATUS_UPDATE' && sender.tab) {
    tabStatus.set(sender.tab.id, message.status);
    return false;
  }

  if (message.type === 'GET_STATUS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const status = tab ? tabStatus.get(tab.id) || { state: 'idle' } : { state: 'idle' };
      sendResponse(status);
    });
    return true;
  }

  return false;
});
