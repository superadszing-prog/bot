const { EventEmitter } = require('events');

/**
 * Process-wide event bus used to fan out job lifecycle events to:
 *  - Socket.io (real-time client updates)
 *  - GraphQL subscriptions
 *  - the webhook delivery service
 *
 * Events emitted:
 *   job_started          { job }
 *   job_completed        { job }
 *   job_failed           { job }
 *   processing_progress  { job }
 *   queue_updated        { stats }
 */
class AppBus extends EventEmitter {}
const bus = new AppBus();
bus.setMaxListeners(50);

const EVENTS = {
  JOB_STARTED: 'job_started',
  JOB_COMPLETED: 'job_completed',
  JOB_FAILED: 'job_failed',
  PROCESSING_PROGRESS: 'processing_progress',
  QUEUE_UPDATED: 'queue_updated',
};

module.exports = { bus, EVENTS };
