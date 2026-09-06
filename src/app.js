const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const config = require('./config');
const logger = require('./config/logger');
const { globalLimiter } = require('./middleware/rateLimiter');
const { authenticate } = require('./middleware/auth');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const commandRoutes = require('./routes/commands');
const videoRoutes = require('./routes/videos');
const permissionRoutes = require('./routes/permissions');
const historyRoutes = require('./routes/history');
const webhookRoutes = require('./routes/webhooks');
const healthRoutes = require('./routes/health');

/**
 * Build the Express application (without binding a port). The GraphQL
 * middleware is injected by server.js after Apollo has started.
 */
function createApp({ graphqlMiddleware } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Security headers — CSP disabled because Apollo Sandbox serves inline assets.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression());
  app.use(cors({
    origin: config.cors.origins.includes('*') ? '*' : config.cors.origins,
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info('HTTP request', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - start,
      });
    });
    next();
  });

  app.use('/api', globalLimiter);

  // GraphQL (HTTP). authenticate is tolerant — it attaches req.user when
  // credentials are present but lets the resolvers enforce authorization.
  if (graphqlMiddleware) {
    app.use('/graphql', optionalAuth, graphqlMiddleware);
  }

  app.use('/api/auth', authRoutes);
  app.use('/api/commands', commandRoutes);
  app.use('/api/videos', videoRoutes);
  app.use('/api/permissions', permissionRoutes);
  app.use('/api/history', historyRoutes);
  app.use('/api/webhooks', webhookRoutes);
  app.use('/api/health', healthRoutes);

  app.get('/', (req, res) => {
    res.json({
      success: true,
      data: {
        name: 'AI Bot API',
        version: '1.0.0',
        docs: '/api/health for status, see README.md for full API documentation',
      },
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/** Attach req.user if valid credentials are present, but never reject here. */
async function optionalAuth(req, res, next) {
  const hasCreds = (req.headers.authorization || '').startsWith('Bearer ') || req.headers['x-api-key'];
  if (!hasCreds) return next();
  return authenticate(req, res, (err) => {
    if (err) return next(); // invalid credentials → resolvers will enforce auth
    return next();
  });
}

module.exports = { createApp };
