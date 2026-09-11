/**
 * Background service worker: routes messages between the popup and the
 * active content script, and centralizes permission checks/logging.
 */
importScripts('../utils/logger.js');

const logger = self.AIBotLogger.createLogger('background');
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';

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

  if (message.type === 'AI_VISION_DETECT') {
    detectVisionRegions(message.payload || {})
      .then((regions) => sendResponse({ ok: true, regions }))
      .catch((error) => {
        logger.error('AI vision proxy failed', error.message);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  return false;
});

async function detectVisionRegions(payload) {
  if (!payload.apiKey) {
    throw new Error('OpenAI API key is required. Set it in the extension permission panel.');
  }
  if (!payload.imageDataUrl) {
    throw new Error('Image data is required for AI vision detection.');
  }

  const response = await fetch(payload.endpoint || OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + payload.apiKey
    },
    body: JSON.stringify({
      model: payload.model || OPENAI_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildPrompt(payload.target) },
            { type: 'image_url', image_url: { url: payload.imageDataUrl } }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0
    })
  });

  if (!response.ok) {
    const errorBody = await safeText(response);
    throw new Error(`OpenAI Vision API error (${response.status}): ${errorBody}`);
  }

  const json = await response.json();
  return parseRegions(json);
}

function buildPrompt(target) {
  const labels = {
    face: 'ใบหน้าคน (human faces)',
    license_plate: 'ป้ายทะเบียนรถ (license plates)',
    personal_info: 'ข้อมูลส่วนตัวที่มองเห็นได้ เช่น ชื่อ ที่อยู่ เบอร์โทร (visible personal information)'
  };
  const label = labels[target] || target;
  return (
    `Detect all ${label} in this image. ` +
    'Respond ONLY with JSON: {"regions": [{"x":0-1,"y":0-1,"width":0-1,"height":0-1,"confidence":0-1}]} ' +
    'where x/y/width/height are normalized (fraction of image size, top-left origin).'
  );
}

function parseRegions(apiResponse) {
  try {
    const content = apiResponse.choices[0].message.content;
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    return Array.isArray(parsed.regions) ? parsed.regions : [];
  } catch (error) {
    logger.warn('Failed to parse AI vision response', error.message);
    return [];
  }
}

async function safeText(response) {
  try {
    return await response.text();
  } catch (error) {
    return '<unavailable>';
  }
}
