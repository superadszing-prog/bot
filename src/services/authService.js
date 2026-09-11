const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { ApiError, ERROR_CODES } = require('../constants/errors');
const { logActivity } = require('./activityService');

async function registerUser({ email, password, name }, req = null) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new ApiError(ERROR_CODES.EMAIL_TAKEN, 'Email is already registered');

  const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds);
  const apiKey = User.generateApiKey();
  const user = await User.create({
    email,
    name,
    passwordHash,
    apiKeyHash: User.hashApiKey(apiKey),
  });
  await Settings.create({ userId: user._id });

  await logActivity(user._id, 'user_registered', { email }, req);

  return { user: user.toSafeJSON(), apiKey, token: signToken(user) };
}

async function loginUser({ email, password }, req = null) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user) throw new ApiError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new ApiError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password');

  await logActivity(user._id, 'user_login', {}, req);
  return { user: user.toSafeJSON(), token: signToken(user) };
}

async function rotateApiKey(user, req = null) {
  const apiKey = User.generateApiKey();
  user.apiKeyHash = User.hashApiKey(apiKey);
  await user.save();
  await logActivity(user._id, 'api_key_rotated', {}, req);
  return apiKey;
}

function signToken(user) {
  return jwt.sign({ sub: String(user._id), email: user.email, role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

module.exports = { registerUser, loginUser, rotateApiKey, signToken };
