const ActivityLog = require('../models/ActivityLog');
const logger = require('../config/logger');

/**
 * Persist an activity log entry. Never throws — logging failures must not
 * break the request path.
 */
async function logActivity(userId, action, details = {}, req = null) {
  try {
    await ActivityLog.create({
      userId,
      action,
      details,
      ip: req ? req.ip : null,
      userAgent: req ? req.headers['user-agent'] : null,
      timestamp: new Date(),
    });
  } catch (err) {
    logger.error('Failed to write activity log', { action, error: err.message });
  }
}

module.exports = { logActivity };
