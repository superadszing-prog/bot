const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const config = require('../config');
const logger = require('../config/logger');

const ALLOWED_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/avi', 'application/octet-stream'];
const ALLOWED_EXTENSIONS = ['.mp4', '.webm', '.mov', '.mkv', '.avi'];

function isAllowedVideo(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext) && ALLOWED_MIME_TYPES.includes(file.mimetype);
}

/**
 * Return a safe file extension for an uploaded video, restricted to the
 * whitelist. Never trusts arbitrary path characters from the client.
 */
function safeExtension(originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext) ? ext : '.mp4';
}

/**
 * Build a storage path guaranteed to stay inside the given base directory.
 * Throws if the resolved path would escape the base (defense in depth).
 */
function safeJoin(base, name) {
  const resolvedBase = path.resolve(base);
  const target = path.resolve(resolvedBase, path.basename(name));
  if (!target.startsWith(resolvedBase + path.sep)) {
    throw new Error('Resolved path escapes the storage directory');
  }
  return target;
}

let s3Client = null;
async function getS3Client() {
  if (s3Client) return s3Client;
  const { S3Client } = require('@aws-sdk/client-s3');
  s3Client = new S3Client({
    region: config.storage.s3.region,
    credentials: config.storage.s3.accessKeyId
      ? { accessKeyId: config.storage.s3.accessKeyId, secretAccessKey: config.storage.s3.secretAccessKey }
      : undefined,
  });
  return s3Client;
}

/**
 * Persist an uploaded file using the configured storage driver.
 * @returns {{ storageDriver, storageUrl, storageKey }}
 */
async function storeFile(file, storedName) {
  if (config.storage.driver === 's3') {
    const client = await getS3Client();
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const key = `videos/${storedName}`;
    await client.send(new PutObjectCommand({
      Bucket: config.storage.s3.bucket,
      Key: key,
      Body: fs.createReadStream(file.path),
      ContentType: file.mimetype,
    }));
    return {
      storageDriver: 's3',
      storageUrl: `s3://${config.storage.s3.bucket}/${key}`,
      storageKey: key,
    };
  }

  // Local storage: multer has already written the file into UPLOAD_DIR.
  return {
    storageDriver: 'local',
    storageUrl: safeJoin(config.storage.uploadDir, path.basename(file.path)),
    storageKey: path.basename(file.path),
  };
}

async function deleteFile(storageDriver, storageKey) {
  try {
    if (storageDriver === 's3') {
      const client = await getS3Client();
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      await client.send(new DeleteObjectCommand({ Bucket: config.storage.s3.bucket, Key: storageKey }));
    } else if (storageKey) {
      await fsp.unlink(safeJoin(config.storage.uploadDir, path.basename(storageKey)));
    }
  } catch (err) {
    logger.warn('Failed to delete stored file', { storageKey, error: err.message });
  }
}

/** Run ffprobe when available; resolve with null otherwise. */
function probeWithFfprobe(filePath) {
  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: 15000 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try {
          resolve(JSON.parse(stdout));
        } catch (parseErr) {
          resolve(null);
        }
      }
    );
  });
}

/**
 * Extract basic video metadata. Uses ffprobe when present, otherwise falls
 * back to container-level information we already know (size, extension).
 */
async function extractMetadata(file) {
  const base = {
    sizeBytes: file.size,
    format: path.extname(file.originalname || '').replace('.', '').toLowerCase() || null,
    durationSec: null,
    width: null,
    height: null,
  };

  const probe = await probeWithFfprobe(file.path);
  if (!probe) return base;

  const videoStream = (probe.streams || []).find((s) => s.codec_type === 'video');
  return {
    ...base,
    format: (probe.format && probe.format.format_name) || base.format,
    durationSec: probe.format && probe.format.duration ? Math.round(parseFloat(probe.format.duration) * 100) / 100 : null,
    width: videoStream ? videoStream.width : null,
    height: videoStream ? videoStream.height : null,
  };
}

module.exports = { storeFile, deleteFile, extractMetadata, isAllowedVideo, safeExtension, safeJoin, ALLOWED_EXTENSIONS };
