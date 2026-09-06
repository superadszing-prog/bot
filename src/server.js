const http = require('http');
const config = require('./config');
const logger = require('./config/logger');
const { connectDatabase } = require('./db/connection');
const { createApp } = require('./app');
const { createGraphQL } = require('./graphql');
const { initSocket, closeSocket } = require('./websocket/socket');
const { initQueue, closeQueue } = require('./queue');
const jobService = require('./services/jobService');
const { startWebhookDispatcher } = require('./services/webhookService');

/**
 * Boot the full server: MongoDB → queue → HTTP+Express → GraphQL → Socket.io.
 * Exported (instead of auto-starting) so tests can drive the lifecycle.
 */
async function startServer({ port = config.server.port } = {}) {
  await connectDatabase();

  await initQueue(jobService.processJob);
  startWebhookDispatcher();

  const httpServer = http.createServer();
  const { middleware: graphqlMiddleware } = await createGraphQL(httpServer);
  const app = createApp({ graphqlMiddleware });
  httpServer.on('request', app);

  initSocket(httpServer);

  await new Promise((resolve) => httpServer.listen(port, resolve));

  const address = httpServer.address();
  logger.info(`AI Bot API listening on http://localhost:${address.port}`);
  logger.info(`GraphQL endpoint: http://localhost:${address.port}/graphql`);

  const shutdown = async (signal = 'manual') => {
    logger.info(`Shutting down (${signal})`);
    await closeSocket();
    await closeQueue();
    httpServer.close();
    process.exit(0);
  };

  return { httpServer, app, shutdown };
}

module.exports = { startServer };
