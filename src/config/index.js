require('dotenv').config();

const toInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const config = {
  env: process.env.NODE_ENV || 'development',
  isTest: (process.env.NODE_ENV || 'development') === 'test',
  isProd: process.env.NODE_ENV === 'production',

  server: {
    port: toInt(process.env.PORT, 3000),
    baseUrl: process.env.BASE_URL || `http://localhost:${toInt(process.env.PORT, 3000)}`,
  },

  mongo: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_bot',
  },

  // Empty string disables Redis and activates the in-memory queue fallback.
  redis: {
    url: process.env.REDIS_URL || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-to-a-long-random-string',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  bcrypt: {
    saltRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 10),
  },

  rateLimit: {
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: toInt(process.env.RATE_LIMIT_MAX, 100),
    commandsMax: toInt(process.env.RATE_LIMIT_COMMANDS_MAX, 20),
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || '*')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },

  storage: {
    driver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
    maxUploadSizeMb: toInt(process.env.MAX_UPLOAD_SIZE_MB, 500),
    s3: {
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      bucket: process.env.S3_BUCKET || '',
    },
  },

  webhooks: {
    secret: process.env.WEBHOOK_SECRET || 'change-me-webhook-secret',
    maxRetries: toInt(process.env.WEBHOOK_MAX_RETRIES, 5),
    timeoutMs: toInt(process.env.WEBHOOK_TIMEOUT_MS, 10000),
  },

  processing: {
    simulate: (process.env.SIMULATE_PROCESSING || 'true') !== 'false',
  },

  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'error' : 'info'),
  },
};

module.exports = config;
