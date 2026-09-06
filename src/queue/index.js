const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const config = require('../config');
const logger = require('../config/logger');
const MemoryQueue = require('./memoryQueue');

const QUEUE_NAME = 'video-processing';

let backend = null; // { driver: 'bullmq'|'memory', ... }

function createRedisConnection() {
  const connection = new IORedis(config.redis.url, {
    maxRetriesPerRequest: null, // required by BullMQ
    lazyConnect: true,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 2000)),
  });
  return connection;
}

/**
 * Initialize the processing queue. Uses BullMQ + Redis when REDIS_URL is
 * configured and reachable; otherwise falls back to the in-memory queue.
 */
async function initQueue(processor, { forceMemory = false } = {}) {
  if (backend) return backend;

  const useMemory = forceMemory || !config.redis.url || config.isTest;

  if (!useMemory) {
    try {
      const connection = createRedisConnection();
      await connection.connect();

      const queue = new Queue(QUEUE_NAME, { connection });
      const worker = new Worker(
        QUEUE_NAME,
        async (job) => processor({ jobId: job.data.jobId, data: job.data, attempts: job.attemptsMade + 1 }),
        {
          connection,
          concurrency: 2,
        }
      );
      worker.on('failed', (job, err) => logger.error('BullMQ job failed', { jobId: job && job.data.jobId, error: err.message }));
      worker.on('error', (err) => logger.error('BullMQ worker error', { error: err.message }));

      backend = {
        driver: 'bullmq',
        connection,
        queue,
        worker,
        async add(jobId, data, { priority = 3, maxAttempts = 3 } = {}) {
          const job = await queue.add('process', { jobId, ...data }, {
            jobId,
            priority,
            attempts: maxAttempts,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: 100,
            removeOnFail: 200,
          });
          return { jobId: job.id };
        },
        async getStats() {
          const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaitingCount(), queue.getActiveCount(), queue.getCompletedCount(),
            queue.getFailedCount(), queue.getDelayedCount(),
          ]);
          return { driver: 'bullmq', waiting, active, completed, failed, delayed };
        },
        async close() {
          await worker.close();
          await queue.close();
          connection.disconnect();
        },
      };
      logger.info('Processing queue initialized with BullMQ/Redis');
      return backend;
    } catch (err) {
      logger.warn('Redis unavailable, falling back to in-memory queue', { error: err.message });
    }
  }

  const memory = new MemoryQueue(processor, { concurrency: 2 });
  backend = {
    driver: 'memory',
    memory,
    add: (jobId, data, opts) => memory.add(jobId, data, opts),
    getStats: () => memory.getStats(),
    close: () => memory.close(),
  };
  logger.info('Processing queue initialized with in-memory driver');
  return backend;
}

function getQueue() {
  if (!backend) throw new Error('Queue not initialized — call initQueue() first');
  return backend;
}

async function closeQueue() {
  if (backend) {
    await backend.close();
    backend = null;
  }
}

module.exports = { initQueue, getQueue, closeQueue, QUEUE_NAME };
