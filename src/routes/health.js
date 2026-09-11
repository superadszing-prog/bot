const express = require('express');
const mongoose = require('mongoose');
const config = require('../config');
const { getQueue } = require('../queue');

const router = express.Router();

const startedAt = Date.now();

/**
 * GET /api/health
 * Liveness/readiness probe: reports uptime plus subsystem status.
 */
router.get('/', async (req, res) => {
  const mongoState = mongoose.connection.readyState; // 1 = connected
  let queue = { driver: 'none' };
  try {
    queue = await getQueue().getStats();
  } catch (err) {
    queue = { driver: 'unavailable' };
  }

  const healthy = mongoState === 1;
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      status: healthy ? 'ok' : 'degraded',
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      env: config.env,
      mongo: { connected: mongoState === 1 },
      queue,
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = router;
