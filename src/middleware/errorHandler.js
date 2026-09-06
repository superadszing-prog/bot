const logger = require('../config/logger');
const { ERROR_CODES, HTTP_STATUS_BY_CODE, ApiError } = require('../constants/errors');

/** 404 handler for unmatched API routes. */
function notFoundHandler(req, res, next) {
  next(new ApiError(ERROR_CODES.NOT_FOUND, `Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Centralized error handler. Produces the standard error envelope:
 *   { success: false, error: { code, message, details? } }
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let code = err.code || ERROR_CODES.INTERNAL_ERROR;
  let status = err.status || HTTP_STATUS_BY_CODE[code] || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  // Multer errors (file upload)
  if (err.name === 'MulterError') {
    code = err.code === 'LIMIT_FILE_SIZE' ? ERROR_CODES.PAYLOAD_TOO_LARGE : ERROR_CODES.BAD_REQUEST;
    status = HTTP_STATUS_BY_CODE[code];
    message = `Upload failed: ${err.message}`;
  }

  // Mongoose validation / cast errors
  if (err.name === 'ValidationError' && err.errors) {
    code = ERROR_CODES.VALIDATION_ERROR;
    status = 400;
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    message = 'Database validation failed';
  }
  if (err.name === 'CastError') {
    code = ERROR_CODES.BAD_REQUEST;
    status = 400;
    message = `Invalid value for field "${err.path}"`;
  }

  if (status >= 500) {
    logger.error('Unhandled error', { code, message, stack: err.stack, path: req.originalUrl });
  } else {
    logger.warn('Request error', { code, message, path: req.originalUrl });
  }

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
}

module.exports = { errorHandler, notFoundHandler };
