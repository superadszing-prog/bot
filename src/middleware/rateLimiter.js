const rateLimit = require('express-rate-limit');
const config = require('../config');
const { ERROR_CODES } = require('../constants/errors');

const buildLimiter = (max, message) => rateLimit({
  windowMs: config.rateLimit.windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? String(req.user._id) : req.ip),
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: { code: ERROR_CODES.RATE_LIMITED, message },
    });
  },
});

/** Global limiter applied to every API route. */
const globalLimiter = buildLimiter(config.rateLimit.max, 'Too many requests, please try again later');

/** Stricter limiter for expensive operations (command execution, uploads). */
const commandLimiter = buildLimiter(config.rateLimit.commandsMax, 'Too many processing requests, please slow down');

/** Limiter for credential endpoints (login/register) to blunt brute force. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: { code: ERROR_CODES.RATE_LIMITED, message: 'Too many authentication attempts, please try again later' },
    });
  },
});

module.exports = { globalLimiter, commandLimiter, authLimiter };
