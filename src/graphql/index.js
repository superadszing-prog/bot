const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/lib/use/ws');
const { ApolloServerPluginDrainHttpServer } = require('@apollo/server/plugin/drainHttpServer');
const express = require('express');
const config = require('../config');
const logger = require('../config/logger');
const typeDefs = require('./typeDefs');
const { resolvers, bridgeBusToPubSub } = require('./resolvers');
const { authenticateSocket } = require('../middleware/auth');
const { ERROR_CODES } = require('../constants/errors');

/**
 * Build the Apollo Server instance together with its graphql-ws subscription
 * server. Returns the pieces needed by the main app bootstrapper.
 */
async function createGraphQL(httpServer) {
  bridgeBusToPubSub();

  const schema = makeExecutableSchema({ typeDefs, resolvers });

  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
  const serverCleanup = useServer(
    {
      schema,
      context: async (ctx) => {
        const params = ctx.connectionParams || {};
        const authHeader = params.authorization || params.Authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : params.token;
        const user = await authenticateSocket({ token, apiKey: params['x-api-key'] || params.apiKey });
        return { user };
      },
    },
    wsServer
  );

  const apollo = new ApolloServer({
    schema,
    introspection: !config.isProd || process.env.GRAPHQL_INTROSPECTION === 'true',
    formatError: (formatted, error) => {
      const original = error && error.originalError;
      const code = (original && original.code) || formatted.extensions?.code || ERROR_CODES.INTERNAL_ERROR;
      if (code === ERROR_CODES.INTERNAL_ERROR) {
        logger.error('GraphQL error', { message: formatted.message, path: formatted.path });
      }
      return {
        message: formatted.message,
        path: formatted.path,
        extensions: { code, details: original && original.details },
      };
    },
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  await apollo.start();

  const middleware = expressMiddleware(apollo, {
    context: async ({ req }) => ({ user: req.user || null }),
  });

  logger.info('GraphQL ready at /graphql (HTTP + WS subscriptions)');
  return { apollo, middleware, wsServer };
}

module.exports = { createGraphQL };
