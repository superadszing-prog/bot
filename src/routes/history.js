const express = require('express');
const { query } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');
const jobService = require('../services/jobService');
const ActivityLog = require('../models/ActivityLog');

const router = express.Router();

const paginationValidators = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  handleValidation,
];

/**
 * GET /api/history/logs
 * Processing history (jobs) and/or activity logs for the authenticated user.
 */
router.get('/logs', authenticate, paginationValidators, async (req, res, next) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const { status } = req.query;

    const [jobs, activities] = await Promise.all([
      jobService.listJobsForUser(req.user._id, { page, limit, status }),
      ActivityLog.find({ userId: req.user._id })
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    res.json({
      success: true,
      data: {
        jobs,
        activities: activities.map((a) => a.toJSON()),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
