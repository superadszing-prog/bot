const crypto = require('crypto');
const logger = require('../config/logger');

/**
 * In-memory fallback queue used when Redis is not available.
 * Implements the same interface as the BullMQ-backed queue so the rest of
 * the application does not need to care which one is active.
 */
class MemoryQueue {
  constructor(processor, { concurrency = 2 } = {}) {
    this.processor = processor;
    this.concurrency = concurrency;
    this.jobs = new Map();
    this.pending = [];
    this.activeCount = 0;
    this.closed = false;
    this.driver = 'memory';
  }

  async add(jobId, data, { priority = 3, maxAttempts = 3 } = {}) {
    if (this.closed) throw new Error('Queue is closed');
    const job = {
      jobId: jobId || crypto.randomUUID(),
      data,
      priority,
      maxAttempts,
      attempts: 0,
      state: 'waiting',
    };
    this.jobs.set(job.jobId, job);
    this.pending.push(job);
    this.pending.sort((a, b) => a.priority - b.priority); // lower number = higher priority
    setImmediate(() => this._drain());
    return job;
  }

  async _drain() {
    while (!this.closed && this.activeCount < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift();
      this.activeCount += 1;
      job.state = 'active';
      this._run(job)
        .catch((err) => logger.error('Memory queue processor error', { jobId: job.jobId, error: err.message }))
        .finally(() => {
          this.activeCount -= 1;
          setImmediate(() => this._drain());
        });
    }
  }

  async _run(job) {
    job.attempts += 1;
    try {
      await this.processor(job);
      job.state = 'completed';
    } catch (err) {
      if (job.attempts < job.maxAttempts) {
        job.state = 'waiting';
        this.pending.push(job);
        this.pending.sort((a, b) => a.priority - b.priority);
        logger.warn('Retrying job', { jobId: job.jobId, attempt: job.attempts });
      } else {
        job.state = 'failed';
        job.failedReason = err.message;
        logger.error('Job failed after max attempts', { jobId: job.jobId, error: err.message });
      }
    }
  }

  async getStats() {
    const counts = { waiting: 0, active: this.activeCount, completed: 0, failed: 0 };
    for (const job of this.jobs.values()) {
      if (job.state === 'waiting') counts.waiting += 1;
      else if (job.state === 'completed') counts.completed += 1;
      else if (job.state === 'failed') counts.failed += 1;
    }
    return { driver: this.driver, ...counts, total: this.jobs.size };
  }

  async close() {
    this.closed = true;
  }
}

module.exports = MemoryQueue;
