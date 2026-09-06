const { Server } = require('socket.io');
const config = require('../config');
const logger = require('../config/logger');
const { bus, EVENTS } = require('../utils/eventBus');
const { authenticateSocket } = require('../middleware/auth');
const ProcessingJob = require('../models/ProcessingJob');

let io = null;

function roomForUser(userId) {
  return `user:${userId}`;
}

function roomForJob(jobId) {
  return `job:${jobId}`;
}

/**
 * Attach a Socket.io server to the HTTP server and bridge internal job events
 * to connected clients in real time.
 */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: config.cors.origins.includes('*') ? '*' : config.cors.origins,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const { token, apiKey } = socket.handshake.auth || {};
    const user = await authenticateSocket({ token, apiKey });
    if (!user) return next(new Error('unauthorized'));
    socket.user = user;
    return next();
  });

  io.on('connection', (socket) => {
    const userId = String(socket.user._id);
    socket.join(roomForUser(userId));
    logger.info('Socket connected', { userId, socketId: socket.id });

    // Clients can subscribe to a specific job they own for focused updates.
    socket.on('subscribe_job', async (jobId, ack) => {
      try {
        const job = await ProcessingJob.findOne({ jobId, userId: socket.user._id });
        if (!job) {
          if (typeof ack === 'function') ack({ success: false, error: 'job_not_found' });
          return;
        }
        socket.join(roomForJob(jobId));
        socket.emit('job_snapshot', { job: job.toJSON() });
        if (typeof ack === 'function') ack({ success: true });
      } catch (err) {
        if (typeof ack === 'function') ack({ success: false, error: err.message });
      }
    });

    socket.on('unsubscribe_job', (jobId) => socket.leave(roomForJob(jobId)));

    socket.on('disconnect', (reason) => {
      logger.info('Socket disconnected', { userId, socketId: socket.id, reason });
    });
  });

  // Bridge internal bus events to sockets. Emit to the job room and the
  // owner's user room as a union so clients in both rooms receive one copy.
  const emitJob = (event) => ({ job }) => {
    if (!job || !job.jobId) return;
    let target = io.to(roomForJob(job.jobId));
    if (job.userId) target = target.to(roomForUser(String(job.userId)));
    target.emit(event, { job });
  };

  bus.on(EVENTS.JOB_STARTED, emitJob(EVENTS.JOB_STARTED));
  bus.on(EVENTS.JOB_COMPLETED, emitJob(EVENTS.JOB_COMPLETED));
  bus.on(EVENTS.JOB_FAILED, emitJob(EVENTS.JOB_FAILED));
  bus.on(EVENTS.PROCESSING_PROGRESS, emitJob(EVENTS.PROCESSING_PROGRESS));

  logger.info('Socket.io initialized at /socket.io');
  return io;
}

function getIO() {
  return io;
}

async function closeSocket() {
  if (io) {
    await io.close();
    io = null;
  }
}

module.exports = { initSocket, getIO, closeSocket, roomForUser, roomForJob };
