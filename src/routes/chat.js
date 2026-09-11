const express = require('express');
const { body, param } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');
const chatService = require('../services/chatService');
const { logActivity } = require('../services/activityService');

const router = express.Router();

router.post(
  '/messages',
  authenticate,
  [
    body('message').isString().trim().notEmpty().withMessage('message is required'),
    body('sessionId').optional().isString().trim().notEmpty(),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const { session, reply } = await chatService.sendMessage({
        userId: req.user._id,
        message: req.body.message,
        sessionId: req.body.sessionId,
      });
      await logActivity(req.user._id, 'chat_message_sent', { sessionId: session.sessionId }, req);
      res.json({ success: true, data: { session, reply } });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/sessions', authenticate, async (req, res, next) => {
  try {
    const sessions = await chatService.listChatSessionsForUser(req.user._id);
    res.json({ success: true, data: { sessions } });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/sessions/:sessionId',
  authenticate,
  [param('sessionId').isString().trim().notEmpty(), handleValidation],
  async (req, res, next) => {
    try {
      const session = await chatService.getChatSessionForUser(req.params.sessionId, req.user._id);
      res.json({ success: true, data: { session } });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
