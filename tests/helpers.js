const http = require('http');
const { mongoose, connectDatabase, disconnectDatabase } = require('../src/db/connection');
const { createApp } = require('../src/app');
const { initQueue, closeQueue } = require('../src/queue');
const jobService = require('../src/services/jobService');
const { startWebhookDispatcher } = require('../src/services/webhookService');
const { bridgeBusToPubSub } = require('../src/graphql/resolvers');

let mongod = null;

/**
 * Connect to MongoDB for tests. Prefers a real instance (TEST_MONGODB_URI or
 * the local default) because mongodb-memory-server needs network access to
 * download its binary, which may be blocked. Falls back to memory-server.
 */
async function startTestDB() {
  const uri = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/ai_bot_test';
  try {
    await connectDatabase(uri);
  } catch (err) {
    // eslint-disable-next-line global-require
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    await connectDatabase(mongod.getUri('ai_bot_test'));
  }
  await initQueue(jobService.processJob, { forceMemory: true });
  startWebhookDispatcher();
  bridgeBusToPubSub();
}

async function stopTestDB() {
  await closeQueue();
  await disconnectDatabase();
  if (mongod) await mongod.stop();
}

async function clearDB() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

/** Build the Express app (without GraphQL) for REST endpoint tests. */
function buildApp() {
  return createApp();
}

/** Spin up a real HTTP server on an ephemeral port (for webhook/socket tests). */
function listen(app) {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

/** Register a fresh user and return { user, apiKey, token }. */
async function registerUser(app, overrides = {}) {
  const request = require('supertest');
  const payload = {
    email: overrides.email || `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: overrides.password || 'password123',
    name: overrides.name || 'Test User',
  };
  const res = await request(app).post('/api/auth/register').send(payload);
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  return res.body.data;
}

module.exports = { startTestDB, stopTestDB, clearDB, buildApp, listen, registerUser };
