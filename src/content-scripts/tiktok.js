/**
 * TikTok-specific entry point. TikTok's feed videos are also standard
 * <video> elements re-created as the user scrolls, which the shared
 * MutationObserver-based detector already handles.
 */
(function () {
  new self.AIBotVideoBotController('tiktok');
})();
