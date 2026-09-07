/**
 * Web demo entry point (used only by the Netlify-published static site in
 * public/). Wires the shared core modules (vendor/*.js, copied verbatim
 * from src/ by scripts/build-netlify.js) to a plain <video> + <input
 * type="file"> UI so the same Thai-language command pipeline used by the
 * browser extension can be tried out without installing anything.
 */
(function () {
  const logger = window.AIBotLogger.createLogger('web-demo');
  const { parseCommand } = window.AIBotCommandParser;
  const { VideoProcessor } = window.AIBotVideoProcessor;
  const { captureFrame } = window.AIBotFrameExtractor;
  const { detectRegions } = window.AIBotAIVision;

  const STORAGE_KEY = 'aiBotWebDemo.apiKey';

  const videoInput = document.getElementById('video-input');
  const videoEl = document.getElementById('preview-video');
  const commandInput = document.getElementById('command-input');
  const runButton = document.getElementById('run-command-btn');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const apiKeyInput = document.getElementById('api-key-input');
  const saveKeyButton = document.getElementById('save-key-btn');

  let processor = null;
  let currentObjectUrl = null;

  function setStatus(state, message) {
    statusIndicator.className = `status status--${state}`;
    statusText.textContent = message;
  }

  // NOTE: this is a light obfuscation layer, not real encryption - it only
  // avoids storing the API key as a directly readable plain string in
  // localStorage (e.g. in browser dev tools "Application" tab at a
  // glance). Anyone with script execution in this origin can still
  // recover the key; there is no fully secure way to store secrets
  // client-side without a backend.
  function obfuscate(value) {
    try {
      return btoa(unescape(encodeURIComponent(value)));
    } catch (error) {
      return '';
    }
  }

  function deobfuscate(value) {
    try {
      return decodeURIComponent(escape(atob(value)));
    } catch (error) {
      return '';
    }
  }

  function loadApiKey() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      apiKeyInput.value = stored ? deobfuscate(stored) : '';
    } catch (error) {
      logger.warn('Unable to read API key from localStorage', error.message);
    }
  }

  function saveApiKey() {
    try {
      window.localStorage.setItem(STORAGE_KEY, obfuscate(apiKeyInput.value.trim()));
      setStatus('done', 'บันทึกคีย์เรียบร้อย');
    } catch (error) {
      logger.error('Unable to save API key to localStorage', error.message);
      setStatus('error', 'ไม่สามารถบันทึกคีย์ได้');
    }
  }

  function getStoredApiKey() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored ? deobfuscate(stored).trim() : '';
    } catch (error) {
      return '';
    }
  }

  function handleVideoSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    if (!file.type || !file.type.startsWith('video/')) {
      setStatus('error', 'กรุณาเลือกไฟล์วิดีโอเท่านั้น');
      return;
    }

    if (processor) {
      processor.stop();
      processor = null;
    }
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
    }

    currentObjectUrl = URL.createObjectURL(file);
    videoEl.src = currentObjectUrl;

    videoEl.onloadedmetadata = () => {
      processor = new VideoProcessor(videoEl, logger);
      processor.start();
      videoEl.play().catch(() => {});
      setStatus('idle', 'พร้อมทำงาน กรุณาพิมพ์คำสั่ง');
    };
  }

  async function runCommand() {
    const command = commandInput.value.trim();
    if (!command) {
      setStatus('error', 'กรุณาพิมพ์คำสั่งก่อน');
      return;
    }
    if (!processor) {
      setStatus('error', 'กรุณาอัปโหลดวิดีโอก่อน');
      return;
    }

    const actions = parseCommand(command);
    if (actions.length === 0) {
      setStatus('error', `ไม่เข้าใจคำสั่ง: "${command}"`);
      return;
    }

    setStatus('processing', `กำลังประมวลผล: ${command}`);

    try {
      const protectActions = actions.filter((a) => a.type === 'protect');
      const trimActions = actions.filter((a) => a.type === 'trim');

      if (protectActions.length > 0) {
        const apiKey = getStoredApiKey();
        if (!apiKey) {
          logger.warn('No API key configured; skipping AI region detection');
          setStatus('error', 'กรุณาใส่ OpenAI API Key เพื่อใช้คำสั่งปกป้อง/เบลอ');
          return;
        }
        const frame = captureFrame(videoEl, { maxWidth: 640 });
        for (const action of protectActions) {
          const regions = await detectRegions(frame, action.target, { apiKey });
          processor.setRegions(regions.map((r) => ({ ...r, method: action.method })));
        }
      }

      for (const action of trimActions) {
        if (action.range) {
          processor.addTrimRange(action.range.start, action.range.end);
        }
      }

      setStatus('done', `เสร็จสิ้น: ${command}`);
    } catch (error) {
      logger.error('Command execution failed', error.message);
      setStatus('error', error.message);
    }
  }

  videoInput.addEventListener('change', handleVideoSelected);
  runButton.addEventListener('click', runCommand);
  saveKeyButton.addEventListener('click', saveApiKey);

  loadApiKey();
})();
