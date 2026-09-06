const { startServer } = require('./server');
const logger = require('./config/logger');

startServer().catch((err) => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { error: reason && reason.message });
});
