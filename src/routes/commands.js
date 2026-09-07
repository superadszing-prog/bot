const express = require('express');
const { body, param } = require('express-validator');
const { authenticate, requirePermission } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');
const { commandLimiter } = require('../middleware/rateLimiter');
const jobService = require('../services/jobService');
const { logActivity } = require('../services/activityService');

const router = express.Router();

/**
 * POST /api/commands/execute
 * Execute a Thai language command asynchronously. Returns the created job.
 */
router.post(
  '/execute',
  authenticate,
  requirePermission('canExecuteCommands'),
  commandLimiter,
  [
    body('command').isString().trim().notEmpty().withMessage('command (Thai) is required'),
    body('videoId').optional().isString().trim(),
    body('priority').optional().isInt({ min: 1, max: 5 }).withMessage('priority must be 1-5'),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const { command, videoId = null, priority = 3 } = req.body;
      const job = await jobService.createJob({ userId: req.user._id, command, videoId, priority });
      await logActivity(req.user._id, 'command_executed', { jobId: job.jobId, command }, req);
      res.status(202).json({ success: true, data: { job } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/commands/status/:jobId
 * Get the processing status of a job.
 */
router.get(
  '/status/:jobId',
  authenticate,
  [param('jobId').isString().trim().notEmpty(), handleValidation],
  async (req, res, next) => {
    try {
      const job = await jobService.getJobForUser(req.params.jobId, req.user._id);
      res.json({ success: true, data: { job } });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
