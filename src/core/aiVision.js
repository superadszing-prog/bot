/**
 * Thin client around the OpenAI Vision API used for face / object
 * detection. Kept provider-agnostic so a local model could be swapped in
 * later (see `detectRegions`'s `provider` option).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  root.AIBotAIVision = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
  const DEFAULT_MODEL = 'gpt-4o-mini';

  /**
   * Ask the OpenAI Vision API to locate regions of interest (faces,
   * license plates, ...) in a single image frame.
   *
   * @param {string} imageDataUrl base64 data URL of the frame (JPEG/PNG)
   * @param {string} target one of 'face' | 'license_plate' | 'personal_info'
   * @param {{apiKey:string, endpoint?:string, model?:string, fetchImpl?:Function}} config
   * @returns {Promise<Array<{x:number,y:number,width:number,height:number,confidence:number}>>}
   */
  async function detectRegions(imageDataUrl, target, config) {
    config = config || {};
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required. Set it in the extension permission panel.');
    }

    if (shouldUseRuntimeProxy(config)) {
      return detectRegionsViaRuntime(imageDataUrl, target, config);
    }

    const fetchImpl = config.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchImpl) {
      throw new Error('No fetch implementation available in this environment.');
    }

    const prompt = buildPrompt(target);
    const body = {
      model: config.model || DEFAULT_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl } }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0
    };

    const authHeaderValue = 'Bearer ' + config.apiKey;
    const response = await fetchImpl(config.endpoint || DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeaderValue
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await safeText(response);
      throw new Error(`OpenAI Vision API error (${response.status}): ${text}`);
    }

    const json = await response.json();
    return parseRegions(json);
  }

  function shouldUseRuntimeProxy(config) {
    return (
      !config.fetchImpl &&
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === 'function' &&
      typeof document !== 'undefined'
    );
  }

  function detectRegionsViaRuntime(imageDataUrl, target, config) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'AI_VISION_DETECT',
          payload: {
            imageDataUrl,
            target,
            apiKey: config.apiKey,
            endpoint: config.endpoint,
            model: config.model
          }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.ok) {
            reject(new Error((response && response.error) || 'AI vision request failed.'));
            return;
          }
          resolve(Array.isArray(response.regions) ? response.regions : []);
        }
      );
    });
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
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[AI-Bot][aiVision] Failed to parse regions from API response', error.message);
      }
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

  return { detectRegions };
});
