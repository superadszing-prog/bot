const winston = require('winston');
const config = require('../config');

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level}: ${stack || message}${rest}`;
  })
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

const logger = winston.createLogger({
  level: config.logging.level,
  format: config.isProd ? prodFormat : devFormat,
  defaultMeta: { service: 'ai-bot-api' },
  transports: [new winston.transports.Console()],
});

// Quiet logs during tests unless explicitly requested
if (config.isTest && !process.env.LOG_LEVEL) {
  logger.transports.forEach((t) => { t.silent = true; });
}

module.exports = logger;
