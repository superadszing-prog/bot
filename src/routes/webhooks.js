const express = require('express');
const crypto = require('crypto');
const { body, param } = require('express-validator');
const { authenticate, requirePermission } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');
const { logActivity } = require('../services/activityService');
const Webhook = require('../models/Webhook');
const { ApiError, ERROR_CODES } = require('../constants/errors');

const router = express.Router();

/**
 * POST /api/webhooks/register
 * Register a webhook for job lifecycle events.
 */
router.post(
  '/register',
  authenticate,
  requirePermission('canManageWebhooks'),
  [
    body('url').isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('A valid http(s) url is required'),
    body('events').optional().isArray({ min: 1 }).withMessage('events must be a non-empty array'),
    body('events.*').optional().isIn(Webhook.EVENTS).withMessage(`Event must be one of: ${Webhook.EVENTS.join(', ')}`),
    body('secret').optional().isString().isLength({ min: 8 }).withMessage('secret must be at least 8 characters'),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const { url, events, secret } = req.body;
      const webhook = await Webhook.create({
        webhookId: `wh_${crypto.randomUUID()}`,
        userId: req.user._id,
        url,
        events: events || Webhook.EVENTS,
        secret: secret || null,
        active: true,
      });
      await logActivity(req.user._id, 'webhook_registered', { webhookId: webhook.webhookId, url }, req);
      res.status(201).json({ success: true, data: { webhook } });
    } catch (err) {
      next(err);
    }
  }
);

/** GET /api/webhooks — list the caller's webhooks. */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const webhooks = await Webhook.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: { webhooks } });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/webhooks/:webhookId — deactivate/remove a webhook. */
router.delete(
  '/:webhookId',
  authenticate,
  requirePermission('canManageWebhooks'),
  [param('webhookId').isString().trim().notEmpty(), handleValidation],
  async (req, res, next) => {
    try {
      const result = await Webhook.deleteOne({ webhookId: req.params.webhookId, userId: req.user._id });
      if (result.deletedCount === 0) {
        throw new ApiError(ERROR_CODES.WEBHOOK_NOT_FOUND, `Webhook not found: ${req.params.webhookId}`);
      }
      await logActivity(req.user._id, 'webhook_deleted', { webhookId: req.params.webhookId }, req);
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
