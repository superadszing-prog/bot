const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { param, query } = require('express-validator');
const config = require('../config');
const { authenticate, requirePermission } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');
const { commandLimiter } = require('../middleware/rateLimiter');
const storageService = require('../services/storageService');
const { logActivity } = require('../services/activityService');
const Video = require('../models/Video');
const { ApiError, ERROR_CODES } = require('../constants/errors');

const router = express.Router();

const uploadDir = path.resolve(config.storage.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: config.storage.maxUploadSizeMb * 1024 * 1024, files: 1 },
});

/**
 * POST /api/videos/upload
 * Multipart upload of a single video file (field name: "video").
 */
router.post(
  '/upload',
  authenticate,
  requirePermission('canUploadVideo'),
  commandLimiter,
  upload.single('video'),
  async (req, res, next) => {
    const cleanup = () => { if (req.file) fs.promises.unlink(req.file.path).catch(() => {}); };
    try {
      if (!req.file) {
        throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 'No video file provided (multipart field "video")');
      }
      if (!storageService.isAllowedVideo(req.file)) {
        cleanup();
        throw new ApiError(ERROR_CODES.INVALID_FILE_TYPE, 'Unsupported video type. Allowed: mp4, webm, mov, mkv, avi');
      }

      const videoId = `vid_${crypto.randomUUID()}`;
      const ext = path.extname(req.file.originalname).toLowerCase() || '.mp4';
      const storedName = `${videoId}${ext}`;

      const metadata = await storageService.extractMetadata(req.file);
      const storage = await storageService.storeFile(req.file, storedName);

      // With the local driver multer picked a random name; rename for stable paths.
      if (storage.storageDriver === 'local') {
        const target = path.join(uploadDir, storedName);
        await fs.promises.rename(req.file.path, target);
        storage.storageUrl = target;
      }

      const video = await Video.create({
        videoId,
        fileName: storedName,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedBy: req.user._id,
        metadata,
        ...storage,
      });

      await logActivity(req.user._id, 'video_uploaded', { videoId, fileSize: req.file.size }, req);
      res.status(201).json({ success: true, data: { video } });
    } catch (err) {
      cleanup();
      next(err);
    }
  }
);

/**
 * GET /api/videos/:videoId
 * Get metadata for an uploaded video owned by the requester.
 */
router.get(
  '/:videoId',
  authenticate,
  [param('videoId').isString().trim().notEmpty(), handleValidation],
  async (req, res, next) => {
    try {
      const video = await Video.findOne({ videoId: req.params.videoId, uploadedBy: req.user._id });
      if (!video) throw new ApiError(ERROR_CODES.VIDEO_NOT_FOUND, `Video not found: ${req.params.videoId}`);
      res.json({ success: true, data: { video } });
    } catch (err) {
      next(err);
    }
  }
);

/** GET /api/videos — list the caller's videos (paginated). */
router.get(
  '/',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const page = req.query.page || 1;
      const limit = req.query.limit || 20;
      const filter = { uploadedBy: req.user._id };
      const [items, total] = await Promise.all([
        Video.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
        Video.countDocuments(filter),
      ]);
      res.json({ success: true, data: { items, total, page, limit, pages: Math.ceil(total / limit) } });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
