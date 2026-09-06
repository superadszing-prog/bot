const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../config/logger');

mongoose.set('strictQuery', true);

/**
 * Connect to MongoDB. Safe to call multiple times; reuses the active connection.
 */
async function connectDatabase(uri = config.mongo.uri) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error', { error: err.message }));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  await mongoose.connect(uri, {
    autoIndex: !config.isProd,
    serverSelectionTimeoutMS: 10000,
  });

  return mongoose.connection;
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = { connectDatabase, disconnectDatabase, mongoose };
