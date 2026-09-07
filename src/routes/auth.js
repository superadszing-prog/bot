const express = require('express');
const { body } = require('express-validator');
const { handleValidation } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const authService = require('../services/authService');

const router = express.Router();

router.post(
  '/register',
  [
    body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').optional().isString().trim().isLength({ max: 120 }),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const { user, apiKey, token } = await authService.registerUser(req.body, req);
      res.status(201).json({ success: true, data: { user, apiKey, token } });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const { user, token } = await authService.loginUser(req.body, req);
      res.json({ success: true, data: { user, token } });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/me', authenticate, async (req, res) => {
  res.json({ success: true, data: { user: req.user.toSafeJSON() } });
});

router.post('/api-key/rotate', authenticate, async (req, res, next) => {
  try {
    const apiKey = await authService.rotateApiKey(req.user, req);
    res.json({ success: true, data: { apiKey } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
