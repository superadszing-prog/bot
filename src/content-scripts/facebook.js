/**
 * Facebook-specific entry point. Facebook renders most feed videos as
 * plain <video> tags, so the shared controller handles detection as-is.
 */
(function () {
  new self.AIBotVideoBotController('facebook');
})();
