const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const { ApiError, ERROR_CODES } = require('../constants/errors');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

function extractApiKey(req) {
  return req.headers['x-api-key'] || null;
}

/**
 * Authenticate via JWT (Authorization: ****** or API key (X-API-Key).
 * Attaches req.user and req.authType on success; responds 401 otherwise.
 */
async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    const apiKey = extractApiKey(req);

    if (!token && !apiKey) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required: provide a ****** or X-API-Key header');
    }

    if (token) {
      let payload;
      try {
        payload = jwt.verify(token, config.jwt.secret);
      } catch (err) {
        const code = err.name === 'TokenExpiredError' ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.TOKEN_INVALID;
        throw new ApiError(code, err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token');
      }
      const user = await User.findById(payload.sub);
      if (!user) throw new ApiError(ERROR_CODES.TOKEN_INVALID, 'Token subject no longer exists');
      req.user = user;
      req.authType = 'jwt';
      return next();
    }

    const apiKeyHash = User.hashApiKey(apiKey);
    const user = await User.findOne({ apiKeyHash }).select('+apiKeyHash');
    if (!user) throw new ApiError(ERROR_CODES.API_KEY_INVALID, 'Invalid API key');
    req.user = user;
    req.authType = 'apiKey';
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Require an authenticated user with one of the given permission flags. */
function requirePermission(flag) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required'));
    if (req.user.role === 'admin') return next();
    if (!req.user.permissions || req.user.permissions[flag] !== true) {
      return next(new ApiError(ERROR_CODES.FORBIDDEN, `Missing permission: ${flag}`));
    }
    return next();
  };
}

/**
 * Socket.io / graphql-ws compatible authenticator.
 * Resolves a user from either a JWT or an API key; returns null on failure.
 */
async function authenticateSocket({ token, apiKey }) {
  try {
    if (token) {
      const payload = jwt.verify(token, config.jwt.secret);
      return await User.findById(payload.sub);
    }
    if (apiKey) {
      return await User.findOne({ apiKeyHash: User.hashApiKey(apiKey) });
    }
    return null;
  } catch (err) {
    return null;
  }
}

module.exports = { authenticate, requirePermission, authenticateSocket, extractToken, extractApiKey };
