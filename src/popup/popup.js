/**
 * Popup UI logic: sends commands to the background service worker, polls
 * for status updates, and manages the permission panel (per-site enable
 * toggles + OpenAI API key), all persisted via chrome.storage.local.
 */
(function () {
  const logger = self.AIBotLogger.createLogger('popup');

  const commandInput = document.getElementById('command-input');
  const runButton = document.getElementById('run-command-btn');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const apiKeyInput = document.getElementById('api-key-input');
  const saveSettingsButton = document.getElementById('save-settings-btn');
  const permCheckboxes = {
    facebook: document.getElementById('perm-facebook'),
    tiktok: document.getElementById('perm-tiktok'),
    instagram: document.getElementById('perm-instagram')
  };

  function setStatus(state, message) {
    statusIndicator.className = `status status--${state}`;
    statusText.textContent = message;
  }

  async function loadSettings() {
    const settings = await self.AIBotPermissions.getSettings();
    apiKeyInput.value = settings.apiKey || '';
    Object.keys(permCheckboxes).forEach((site) => {
      permCheckboxes[site].checked = Boolean(settings.enabledSites[site]);
    });
  }

  async function saveSettings() {
    const enabledSites = {};
    Object.keys(permCheckboxes).forEach((site) => {
      enabledSites[site] = permCheckboxes[site].checked;
    });
    await self.AIBotPermissions.saveSettings({ apiKey: apiKeyInput.value.trim(), enabledSites });
    setStatus('done', 'บันทึกการตั้งค่าเรียบร้อย');
    logger.info('Settings saved');
  }

  function runCommand() {
    const command = commandInput.value.trim();
    if (!command) {
      setStatus('error', 'กรุณาพิมพ์คำสั่งก่อน');
      return;
    }
    setStatus('processing', 'กำลังส่งคำสั่ง...');
    chrome.runtime.sendMessage({ type: 'RUN_COMMAND', command }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus('error', chrome.runtime.lastError.message);
        return;
      }
      if (!response || !response.ok) {
        setStatus('error', (response && response.error) || 'เกิดข้อผิดพลาด');
        return;
      }
      setStatus('done', 'สั่งงานสำเร็จ');
    });
  }

  function pollStatus() {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (chrome.runtime.lastError || !response) return;
      setStatus(response.state || 'idle', response.message || 'พร้อมทำงาน');
    });
  }

  runButton.addEventListener('click', runCommand);
  saveSettingsButton.addEventListener('click', saveSettings);

  const pollTimer = setInterval(pollStatus, 1000);
  window.addEventListener('unload', () => clearInterval(pollTimer));
  loadSettings();
  pollStatus();
})();
