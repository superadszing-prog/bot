/**
 * Simple leveled logger used across the extension (background, content
 * scripts and popup). Works both in the browser (attaches to `self`) and
 * in Node.js (module.exports) so it can be covered by unit tests.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  root.AIBotLogger = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  const LEVELS = ['debug', 'info', 'warn', 'error'];
  const PREFIX = '[AI-Bot]';

  function createLogger(scope, options) {
    options = options || {};
    const minLevel = options.level || 'info';
    const minIndex = LEVELS.indexOf(minLevel) === -1 ? 1 : LEVELS.indexOf(minLevel);
    const history = [];
    const maxHistory = options.maxHistory || 200;

    function log(level, message, meta) {
      const index = LEVELS.indexOf(level);
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        scope,
        message,
        meta: meta || null
      };

      history.push(entry);
      if (history.length > maxHistory) {
        history.shift();
      }

      if (index < minIndex) {
        return entry;
      }

      const label = `${PREFIX}[${scope}][${level.toUpperCase()}]`;
      const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      if (typeof console !== 'undefined' && console[consoleMethod]) {
        if (meta !== undefined) {
          console[consoleMethod](label, message, meta);
        } else {
          console[consoleMethod](label, message);
        }
      }

      return entry;
    }

    const logger = { getHistory: () => history.slice() };
    LEVELS.forEach((level) => {
      logger[level] = (message, meta) => log(level, message, meta);
    });
    return logger;
  }

  return { createLogger, LEVELS };
});
