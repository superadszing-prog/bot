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
  const { captureFrame, extractFrames } = self.AIBotFrameExtractor;
  const { detectRegions } = self.AIBotAIVision;
  const { isSiteEnabled } = self.AIBotPermissions;

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
        this._pruneDisconnectedProcessors();
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

    _pruneDisconnectedProcessors() {
      for (const [videoEl, processor] of this.processors.entries()) {
        if (!videoEl.isConnected) {
          processor.stop();
          this.processors.delete(videoEl);
        }
      }
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

      this._pruneDisconnectedProcessors();
      if (this.processors.size === 0) {
        this._updateStatus('error', 'ไม่พบวิดีโอในหน้านี้');
        throw new Error('ไม่พบวิดีโอในหน้านี้');
      }

      this._updateStatus('processing', `กำลังประมวลผล: ${rawCommand}`);

      const settings = await self.AIBotPermissions.getSettings();
      if (!isSiteEnabled(settings, this.platform)) {
        this._updateStatus('error', `ยังไม่ได้เปิดสิทธิ์สำหรับ ${this.platform}`);
        throw new Error(`ยังไม่ได้เปิดสิทธิ์สำหรับ ${this.platform}`);
      }

      const results = [];
      try {
        for (const [videoEl, processor] of this.processors) {
          results.push(await this._applyActions(videoEl, processor, actions, settings));
        }
      } catch (error) {
        this._updateStatus('error', error.message || 'ประมวลผลไม่สำเร็จ');
        throw error;
      }

      this._updateStatus('done', `เสร็จสิ้น: ${rawCommand}`);
      return results;
    }

    async _applyActions(videoEl, processor, actions, settings) {
      const protectActions = actions.filter((a) => a.type === 'protect');
      const trimActions = actions.filter((a) => a.type === 'trim');

      if (protectActions.length > 0) {
        if (!settings.apiKey) {
          throw new Error('กรุณาใส่ OpenAI API Key เพื่อใช้คำสั่งปกป้อง/เบลอ');
        }

        const frameStart = Math.max(0, videoEl.currentTime || 0);
        const sampledFrames = await extractFrames(videoEl, {
          start: frameStart,
          end: frameStart + 2,
          intervalSeconds: 1,
          maxWidth: 640,
          maxSamples: 3
        });
        const frameDataUrls = sampledFrames.map((frame) => frame.dataUrl).filter(Boolean);
        if (frameDataUrls.length === 0) {
          const singleFrame = captureFrame(videoEl, { maxWidth: 640 });
          if (singleFrame) {
            frameDataUrls.push(singleFrame);
          }
        }
        if (frameDataUrls.length === 0) {
          throw new Error('ไม่สามารถดึงเฟรมวิดีโอเพื่อปกป้องข้อมูลได้');
        }

        const mappedRegions = [];
        let detectError = null;
        for (const action of protectActions) {
          for (const frameDataUrl of frameDataUrls) {
            try {
              const regions = await detectRegions(frameDataUrl, action.target, { apiKey: settings.apiKey });
              mappedRegions.push(...regions.map((r) => ({ ...r, method: action.method })));
            } catch (error) {
              logger.error('AI vision detection failed', error.message);
              detectError = detectError || error;
            }
          }
        }
        if (detectError) {
          throw new Error(`AI vision detection failed: ${detectError.message}`);
        }
        processor.setRegions(mappedRegions);
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
