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

  function setStatus(state, message) {
    statusIndicator.className = `status status--${state}`;
    statusText.textContent = message;
  }

  function loadApiKey() {
    try {
      apiKeyInput.value = window.localStorage.getItem(STORAGE_KEY) || '';
    } catch (error) {
      logger.warn('Unable to read API key from localStorage', error.message);
    }
  }

  function saveApiKey() {
    try {
      window.localStorage.setItem(STORAGE_KEY, apiKeyInput.value.trim());
      setStatus('done', 'บันทึกคีย์เรียบร้อย');
    } catch (error) {
      logger.error('Unable to save API key to localStorage', error.message);
      setStatus('error', 'ไม่สามารถบันทึกคีย์ได้');
    }
  }

  function handleVideoSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    if (processor) {
      processor.stop();
      processor = null;
    }

    const objectUrl = URL.createObjectURL(file);
    videoEl.src = objectUrl;

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
        const apiKey = (window.localStorage.getItem(STORAGE_KEY) || '').trim();
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
