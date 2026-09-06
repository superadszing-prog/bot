/**
 * Applies visual modifications (blur / pixelate / trim markers) to a video
 * element by rendering a processed canvas overlay on top of it in
 * real-time. This keeps the original <video> untouched (we don't have
 * write-access to the social network's media) while visually protecting
 * sensitive regions for the viewer using the extension.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  root.AIBotVideoProcessor = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  class VideoProcessor {
    /**
     * @param {HTMLVideoElement} videoEl
     * @param {object} [logger] optional logger (see utils/logger.js)
     */
    constructor(videoEl, logger) {
      this.videoEl = videoEl;
      this.logger = logger;
      this.regions = []; // [{x,y,width,height,method}] normalized 0-1
      this.trimRanges = []; // [{start,end}] seconds to skip
      this.canvas = null;
      this.ctx = null;
      this._rafId = null;
      this._running = false;
    }

    /** Create/attach the overlay canvas positioned over the video element. */
    mount() {
      if (typeof document === 'undefined' || this.canvas) {
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.className = 'ai-bot-overlay-canvas';
      canvas.style.position = 'absolute';
      canvas.style.pointerEvents = 'none';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.zIndex = '2147483647';

      const parent = this.videoEl.parentElement;
      if (parent) {
        const computedPosition = window.getComputedStyle(parent).position;
        if (computedPosition === 'static') {
          parent.style.position = 'relative';
        }
        parent.appendChild(canvas);
      }

      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this._syncSize();
    }

    _syncSize() {
      if (!this.canvas) return;
      this.canvas.width = this.videoEl.videoWidth || this.videoEl.clientWidth || 320;
      this.canvas.height = this.videoEl.videoHeight || this.videoEl.clientHeight || 240;
      this.canvas.style.width = `${this.videoEl.clientWidth}px`;
      this.canvas.style.height = `${this.videoEl.clientHeight}px`;
    }

    /** Replace the list of protected regions detected by the AI vision step. */
    setRegions(regions) {
      this.regions = Array.isArray(regions) ? regions : [];
    }

    /** Add a segment (in seconds) that should be skipped/hidden ("ตัดตอน"). */
    addTrimRange(start, end) {
      this.trimRanges.push({ start, end });
    }

    /** Start the real-time render loop. */
    start() {
      if (this._running) return;
      this.mount();
      this._running = true;
      const loop = () => {
        if (!this._running) return;
        this._renderFrame();
        this._rafId = requestAnimationFrame(loop);
      };
      this._rafId = requestAnimationFrame(loop);
      if (this.logger) this.logger.info('Video processor started');
    }

    /** Stop rendering and clear the overlay. */
    stop() {
      this._running = false;
      if (this._rafId && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this._rafId);
      }
      if (this.ctx && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
      if (this.logger) this.logger.info('Video processor stopped');
    }

    _isTrimmed(time) {
      return this.trimRanges.some((range) => time >= range.start && time <= range.end);
    }

    _renderFrame() {
      if (!this.ctx) return;
      this._syncSize();
      const { ctx, canvas, videoEl } = this;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const currentTime = videoEl.currentTime || 0;
      if (this._isTrimmed(currentTime)) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ส่วนนี้ถูกตัดออก', canvas.width / 2, canvas.height / 2);
        return;
      }

      for (const region of this.regions) {
        this._applyRegionEffect(region);
      }
    }

    _applyRegionEffect(region) {
      const { ctx, canvas } = this;
      const x = region.x * canvas.width;
      const y = region.y * canvas.height;
      const width = region.width * canvas.width;
      const height = region.height * canvas.height;

      if (region.method === 'pixelate') {
        this._pixelateRegion(x, y, width, height);
      } else {
        // default: blur via a solid, semi-opaque box (canvas 2D blur filter
        // is not universally supported on capture, so we approximate).
        ctx.save();
        ctx.filter = 'blur(12px)';
        ctx.drawImage(this.videoEl, x, y, width, height, x, y, width, height);
        ctx.restore();
      }
    }

    _pixelateRegion(x, y, width, height, blockSize = 10) {
      const { ctx } = this;
      const w = Math.max(1, Math.floor(width / blockSize));
      const h = Math.max(1, Math.floor(height / blockSize));

      if (!this._offscreenCanvas) {
        this._offscreenCanvas = document.createElement('canvas');
      }
      const offscreen = this._offscreenCanvas;
      offscreen.width = w;
      offscreen.height = h;
      const offscreenCtx = offscreen.getContext('2d');
      offscreenCtx.imageSmoothingEnabled = false;
      offscreenCtx.clearRect(0, 0, w, h);
      // Draw the region small onto the offscreen canvas...
      offscreenCtx.drawImage(this.videoEl, x, y, width, height, 0, 0, w, h);

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      // ...then scale it back up onto the main canvas for a pixelated look.
      ctx.drawImage(offscreen, 0, 0, w, h, x, y, width, height);
      ctx.restore();
    }
  }

  return { VideoProcessor };
});
