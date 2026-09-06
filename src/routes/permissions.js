const express = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');
const { logActivity } = require('../services/activityService');
const Settings = require('../models/Settings');
const User = require('../models/User');

const PLATFORMS = Settings.PLATFORMS;
const router = express.Router();

const settingsValidators = [
  body('enabledPlatforms').optional().isArray().withMessage('enabledPlatforms must be an array'),
  body('enabledPlatforms.*').optional().isIn(PLATFORMS).withMessage(`Platform must be one of: ${PLATFORMS.join(', ')}`),
  body('apiKeys').optional().isObject().withMessage('apiKeys must be an object of platform -> key'),
  body('preferences').optional().isObject().withMessage('preferences must be an object'),
  body('preferences.language').optional().isString().isLength({ min: 2, max: 10 }),
  body('preferences.notifications').optional().isBoolean(),
  body('preferences.defaultBlurStrength').optional().isInt({ min: 1, max: 100 }),
  body('preferences.autoProcess').optional().isBoolean(),
  handleValidation,
];

/**
 * POST /api/permissions/settings
 * Create or update the authenticated user's settings (upsert).
 */
router.post('/settings', authenticate, settingsValidators, async (req, res, next) => {
  try {
    const { enabledPlatforms, apiKeys, preferences } = req.body;

    let settings = await Settings.findOne({ userId: req.user._id });
    if (!settings) settings = new Settings({ userId: req.user._id });

    if (enabledPlatforms !== undefined) settings.enabledPlatforms = enabledPlatforms;
    if (apiKeys !== undefined) {
      const current = Object.fromEntries(settings.apiKeys || new Map());
      settings.apiKeys = { ...current, ...apiKeys };
    }
    if (preferences !== undefined) {
      settings.preferences = { ...settings.preferences.toObject(), ...preferences };
    }
    await settings.save();

    // Keep the embedded copy on User in sync for fast reads.
    await User.updateOne(
      { _id: req.user._id },
      {
        'settings.enabledPlatforms': settings.enabledPlatforms,
        'settings.preferences': settings.preferences,
        'settings.apiKeys': settings.apiKeys,
      }
    );

    await logActivity(req.user._id, 'settings_updated', { enabledPlatforms: settings.enabledPlatforms }, req);
    res.json({ success: true, data: { settings } });
  } catch (err) {
    next(err);
  }
});

/** GET /api/permissions/settings — read current settings. */
router.get('/settings', authenticate, async (req, res, next) => {
  try {
    const settings = await Settings.findOne({ userId: req.user._id });
    res.json({ success: true, data: { settings: settings ? settings.toJSON() : null } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
