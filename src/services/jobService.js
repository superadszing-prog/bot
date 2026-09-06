const crypto = require('crypto');
const ProcessingJob = require('../models/ProcessingJob');
const Video = require('../models/Video');
const { parseCommand } = require('../utils/thaiCommands');
const { bus, EVENTS } = require('../utils/eventBus');
const { getQueue } = require('../queue');
const config = require('../config');
const logger = require('../config/logger');
const { ApiError, ERROR_CODES } = require('../constants/errors');

const SIMULATED_STEPS = [10, 25, 45, 65, 80, 92, 100];

function snapshot(job) {
  return {
    jobId: job.jobId,
    userId: String(job.userId),
    status: job.status,
    progress: job.progress,
    command: job.command,
    videoId: job.videoId,
    error: job.error,
    results: job.results,
  };
}

async function persist(jobDoc) {
  await jobDoc.save();
  bus.emit(EVENTS.PROCESSING_PROGRESS, { job: snapshot(jobDoc) });
}

/**
 * Create a processing job from a Thai language command and enqueue it.
 */
async function createJob({ userId, command, videoId = null, priority = 3 }) {
  const parsed = parseCommand(command); // throws ApiError on unsupported command

  if (videoId) {
    const video = await Video.findOne({ videoId });
    if (!video) throw new ApiError(ERROR_CODES.VIDEO_NOT_FOUND, `Video not found: ${videoId}`);
  }

  const job = await ProcessingJob.create({
    jobId: `job_${crypto.randomUUID()}`,
    userId,
    command,
    parsedCommand: { action: parsed.action, params: parsed.params, language: parsed.language },
    videoId,
    priority,
    status: 'queued',
    progress: 0,
  });

  const queue = getQueue();
  await queue.add(job.jobId, { jobId: job.jobId }, { priority, maxAttempts: 3 });

  logger.info('Job created', { jobId: job.jobId, action: parsed.action, userId: String(userId) });
  return job;
}

/**
 * The queue processor: drives a job through its lifecycle and emits
 * real-time events along the way.
 */
async function processJob({ jobId }) {
  const job = await ProcessingJob.findOne({ jobId });
  if (!job) {
    logger.warn('Processor received unknown job', { jobId });
    return;
  }

  job.status = 'processing';
  job.startedAt = new Date();
  job.attempts += 1;
  await job.save();
  bus.emit(EVENTS.JOB_STARTED, { job: snapshot(job) });

  try {
    let result;
    if (config.processing.simulate) {
      result = await simulateProcessing(job);
    } else {
      result = await runRealProcessing(job);
    }

    job.status = 'completed';
    job.progress = 100;
    job.results = result;
    job.completedAt = new Date();
    await job.save();
    bus.emit(EVENTS.JOB_COMPLETED, { job: snapshot(job) });
  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
    job.completedAt = new Date();
    await job.save();
    bus.emit(EVENTS.JOB_FAILED, { job: snapshot(job) });
    throw err; // let the queue decide about retries
  }
}

async function simulateProcessing(job) {
  for (const step of SIMULATED_STEPS) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 200));
    job.progress = step;
    // eslint-disable-next-line no-await-in-loop
    await persist(job);
  }
  return buildResult(job);
}

function buildResult(job) {
  const base = { action: job.parsedCommand.action, processedAt: new Date().toISOString() };
  switch (job.parsedCommand.action) {
    case 'blur_faces':
      return { ...base, facesBlurred: 3 };
    case 'blur_license_plates':
      return { ...base, platesBlurred: 2 };
    case 'hide_personal_info':
      return { ...base, regionsHidden: 4 };
    case 'trim_video':
      return { ...base, trimmed: job.parsedCommand.params };
    case 'remove_watermark':
      return { ...base, watermarksRemoved: 1 };
    case 'adjust_brightness':
      return { ...base, brightness: job.parsedCommand.params };
    default:
      return base;
  }
}

/** Hook for plugging in a real video processing pipeline. */
async function runRealProcessing(job) {
  throw new Error(`Real processing pipeline not implemented for action "${job.parsedCommand.action}"`);
}

async function getJobForUser(jobId, userId) {
  const job = await ProcessingJob.findOne({ jobId, userId });
  if (!job) throw new ApiError(ERROR_CODES.JOB_NOT_FOUND, `Job not found: ${jobId}`);
  return job;
}

async function listJobsForUser(userId, { page = 1, limit = 20, status } = {}) {
  const filter = { userId };
  if (status) filter.status = status;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    ProcessingJob.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ProcessingJob.countDocuments(filter),
  ]);
  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

module.exports = { createJob, processJob, getJobForUser, listJobsForUser };
