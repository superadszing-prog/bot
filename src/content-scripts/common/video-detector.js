/**
 * Shared controller used by all social-media content scripts. Detects
 * <video> elements on the page, wires them to the command parser / video
 * processor / AI vision pipeline, and reports status back to the
 * background service worker + popup.
 *
 * Platform-specific files (facebook.js, tiktok.js, instagram.js) just
 * instantiate this with a `platform` name.
 */
(function () {
  const logger = self.AIBotLogger.createLogger('content');
  const { parseCommand } = self.AIBotCommandParser;
  const { VideoProcessor } = self.AIBotVideoProcessor;
  const { extractFrames } = self.AIBotFrameExtractor;
  const { detectRegions } = self.AIBotAIVision;

  class VideoBotController {
    constructor(platform) {
      this.platform = platform;
      this.processors = new Map(); // video element -> VideoProcessor
      this.status = { state: 'idle', platform, message: 'พร้อมทำงาน' };
      this._observeVideos();
      this._listenForCommands();
    }

    _observeVideos() {
      const scan = () => {
        document.querySelectorAll('video').forEach((videoEl) => {
          if (!this.processors.has(videoEl)) {
            const processor = new VideoProcessor(videoEl, logger);
            this.processors.set(videoEl, processor);
            logger.info(`Detected new video on ${this.platform}`);
          }
        });
      };
      scan();
      const observer = new MutationObserver(scan);
      observer.observe(document.body, { childList: true, subtree: true });
    }

    _listenForCommands() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message && message.type === 'RUN_COMMAND') {
          this.runCommand(message.command)
            .then((result) => sendResponse({ ok: true, result }))
            .catch((error) => sendResponse({ ok: false, error: error.message }));
          return true;
        }
        return false;
      });
    }

    _updateStatus(state, message) {
      this.status = { state, platform: this.platform, message };
      chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', status: this.status });
    }

    async runCommand(rawCommand) {
      const actions = parseCommand(rawCommand);
      if (actions.length === 0) {
        this._updateStatus('error', `ไม่เข้าใจคำสั่ง: "${rawCommand}"`);
        throw new Error('คำสั่งไม่ถูกต้อง หรือยังไม่รองรับ');
      }

      if (this.processors.size === 0) {
        this._updateStatus('error', 'ไม่พบวิดีโอในหน้านี้');
        throw new Error('ไม่พบวิดีโอในหน้านี้');
      }

      this._updateStatus('processing', `กำลังประมวลผล: ${rawCommand}`);

      const settings = await self.AIBotPermissions.getSettings();
      const results = [];
      for (const [videoEl, processor] of this.processors) {
        results.push(await this._applyActions(videoEl, processor, actions, settings));
      }

      this._updateStatus('done', `เสร็จสิ้น: ${rawCommand}`);
      return results;
    }

    async _applyActions(videoEl, processor, actions, settings) {
      const protectActions = actions.filter((a) => a.type === 'protect');
      const trimActions = actions.filter((a) => a.type === 'trim');

      if (protectActions.length > 0) {
        if (!settings.apiKey) {
          logger.warn('No API key configured; skipping AI region detection');
        } else {
          const frame = self.AIBotFrameExtractor.captureFrame(videoEl, { maxWidth: 640 });
          for (const action of protectActions) {
            try {
              const regions = await detectRegions(frame, action.target, { apiKey: settings.apiKey });
              processor.setRegions(
                regions.map((r) => ({ ...r, method: action.method }))
              );
            } catch (error) {
              logger.error('AI vision detection failed', error.message);
            }
          }
        }
      }

      for (const action of trimActions) {
        if (action.range) {
          processor.addTrimRange(action.range.start, action.range.end);
        }
      }

      processor.start();
      return { platform: this.platform, actions };
    }
  }

  self.AIBotVideoBotController = VideoBotController;
})();
