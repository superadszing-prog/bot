/**
 * Extracts frames from an HTMLVideoElement so they can be sent to the AI
 * vision pipeline for face / object detection. Runs only in the browser
 * (relies on <canvas> + <video>).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  root.AIBotFrameExtractor = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  /**
   * Capture a single frame from a video element as a base64 JPEG data URL.
   * @param {HTMLVideoElement} videoEl
   * @param {{maxWidth?: number, quality?: number}} [options]
   * @returns {string|null} data URL, or null if capture isn't possible.
   */
  function captureFrame(videoEl, options) {
    options = options || {};
    if (typeof document === 'undefined' || !videoEl || !videoEl.videoWidth) {
      return null;
    }

    const maxWidth = options.maxWidth || 640;
    const scale = Math.min(1, maxWidth / videoEl.videoWidth);
    const width = Math.max(1, Math.round(videoEl.videoWidth * scale));
    const height = Math.max(1, Math.round(videoEl.videoHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', options.quality || 0.8);
    } catch (error) {
      return null;
    }
  }

  /**
   * Sample frames from a video at a fixed interval (in seconds) between an
   * optional start/end range. Returns a promise resolving to an array of
   * { timestamp, dataUrl } objects.
   */
  async function extractFrames(
    videoEl,
    { start = 0, end = null, intervalSeconds = 1, maxWidth = 640, maxSamples = 300 } = {}
  ) {
    if (typeof document === 'undefined' || !videoEl) {
      return [];
    }
    const safeInterval = intervalSeconds > 0 ? intervalSeconds : 1;

    const safeMaxSamples = Number.isFinite(maxSamples) && maxSamples > 0 ? Math.floor(maxSamples) : 300;
    const requestedDuration = end !== null ? end : videoEl.duration;
    const duration = Number.isFinite(requestedDuration)
      ? Math.max(start, requestedDuration)
      : start + safeInterval * (safeMaxSamples - 1);
    const frames = [];
    const wasPaused = videoEl.paused;
    const originalTime = videoEl.currentTime;

    try {
      for (let t = start, sampled = 0; t <= duration && sampled < safeMaxSamples; t += safeInterval, sampled += 1) {
        await seekTo(videoEl, t);
        const dataUrl = captureFrame(videoEl, { maxWidth });
        if (dataUrl) {
          frames.push({ timestamp: t, dataUrl });
        }
      }
    } finally {
      videoEl.currentTime = originalTime;
      if (!wasPaused) {
        videoEl.play().catch(() => {});
      }
    }

    return frames;
  }

  function seekTo(videoEl, time, timeoutMs = 1000) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        videoEl.removeEventListener('seeked', onSeeked);
        clearTimeout(timer);
        resolve();
      };
      const onSeeked = () => finish();
      // Fallback in case the browser doesn't fire 'seeked' (e.g. seeking to
      // the current time is a no-op), so extractFrames never hangs.
      const timer = setTimeout(finish, timeoutMs);
      videoEl.addEventListener('seeked', onSeeked);
      videoEl.currentTime = time;
    });
  }

  return { captureFrame, extractFrames };
});
