const { validationResult } = require('express-validator');
const { ERROR_CODES } = require('../constants/errors');

/**
 * Collect express-validator results and return a standardized 400 response.
 */
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(400).json({
    success: false,
    error: {
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Request validation failed',
      details: errors.array().map((e) => ({ field: e.path, message: e.msg, value: e.value })),
    },
  });
}

module.exports = { handleValidation };
