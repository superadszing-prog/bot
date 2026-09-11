const { PubSub } = require('graphql-subscriptions');
const { GraphQLJSON } = require('graphql-type-json');
const { GraphQLDateTime } = require('graphql-scalars');
const { withFilter } = require('graphql-subscriptions');
const jobService = require('../services/jobService');
const { logActivity } = require('../services/activityService');
const { getQueue } = require('../queue');
const { bus, EVENTS } = require('../utils/eventBus');
const Settings = require('../models/Settings');
const User = require('../models/User');
const Webhook = require('../models/Webhook');
const Video = require('../models/Video');
const ActivityLog = require('../models/ActivityLog');
const chatService = require('../services/chatService');
const crypto = require('crypto');
const { GraphQLError } = require('graphql');
const { ApiError, ERROR_CODES } = require('../constants/errors');

const pubsub = new PubSub();
const SUB_TOPICS = { JOB_UPDATED: 'JOB_UPDATED' };

let bridgeAttached = false;
function bridgeBusToPubSub() {
  if (bridgeAttached) return;
  bridgeAttached = true;
  const publish = ({ job }) => pubsub.publish(SUB_TOPICS.JOB_UPDATED, { job });
  bus.on(EVENTS.JOB_STARTED, publish);
  bus.on(EVENTS.JOB_COMPLETED, publish);
  bus.on(EVENTS.JOB_FAILED, publish);
  bus.on(EVENTS.PROCESSING_PROGRESS, publish);
}

/** Wrap an ApiError (or any error) as a GraphQLError carrying the app code. */
function toGraphQLError(err) {
  if (err instanceof GraphQLError) return err;
  const code = (err && err.code) || ERROR_CODES.INTERNAL_ERROR;
  return new GraphQLError(err.message || 'Internal server error', {
    extensions: { code, details: err && err.details },
  });
}

function requireUser(context) {
  if (!context.user) {
    throw new GraphQLError('Authentication required', {
      extensions: { code: ERROR_CODES.UNAUTHORIZED },
    });
  }
  return context.user;
}

/** Wrap a resolver fn so thrown ApiErrors surface their app error code. */
function guard(fn) {
  return async (parent, args, context, info) => {
    try {
      return await fn(parent, args, context, info);
    } catch (err) {
      throw toGraphQLError(err);
    }
  };
}

function guardAll(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, guard(v)]));
}

const resolvers = {
  JSON: GraphQLJSON,
  DateTime: GraphQLDateTime,

  Query: guardAll({
    getCommandStatus: async (_parent, { jobId }, context) => {
      const user = requireUser(context);
      return jobService.getJobForUser(jobId, user._id);
    },
    getVideoMetadata: async (_parent, { videoId }, context) => {
      const user = requireUser(context);
      const video = await Video.findOne({ videoId, uploadedBy: user._id });
      if (!video) throw new ApiError(ERROR_CODES.VIDEO_NOT_FOUND, `Video not found: ${videoId}`);
      return video;
    },
    getUserSettings: async (_parent, _args, context) => {
      const user = requireUser(context);
      return Settings.findOne({ userId: user._id });
    },
    getProcessingHistory: async (_parent, { page = 1, limit = 20, status }, context) => {
      const user = requireUser(context);
      return jobService.listJobsForUser(user._id, { page, limit, status });
    },
    getActivityLogs: async (_parent, { page = 1, limit = 20 }, context) => {
      const user = requireUser(context);
      return ActivityLog.find({ userId: user._id })
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
    },
    getQueueStats: async (_parent, _args, context) => {
      requireUser(context);
      return getQueue().getStats();
    },
    getChatSessions: async (_parent, _args, context) => {
      const user = requireUser(context);
      return chatService.listChatSessionsForUser(user._id);
    },
    getChatSession: async (_parent, { sessionId }, context) => {
      const user = requireUser(context);
      return chatService.getChatSessionForUser(sessionId, user._id);
    },
  }),

  Mutation: guardAll({
    executeCommand: async (_parent, { command, videoId = null, priority = 3 }, context) => {
      const user = requireUser(context);
      const job = await jobService.createJob({ userId: user._id, command, videoId, priority });
      await logActivity(user._id, 'command_executed', { jobId: job.jobId, command });
      return job;
    },
    sendChatMessage: async (_parent, { message, sessionId = null }, context) => {
      const user = requireUser(context);
      const result = await chatService.sendMessage({ userId: user._id, message, sessionId });
      await logActivity(user._id, 'chat_message_sent', { sessionId: result.session.sessionId });
      return result;
    },
    uploadVideo: async (_parent, { videoId }, context) => {
      // Binary upload happens over REST multipart; this mutation links an
      // already-uploaded video into the processing workspace (marks it ready).
      const user = requireUser(context);
      const video = await Video.findOne({ videoId, uploadedBy: user._id });
      if (!video) throw new ApiError(ERROR_CODES.VIDEO_NOT_FOUND, `Video not found: ${videoId}`);
      if (video.status === 'uploaded') {
        video.status = 'ready';
        await video.save();
      }
      return { video };
    },
    updateSettings: async (_parent, { input }, context) => {
      const user = requireUser(context);
      let settings = await Settings.findOne({ userId: user._id });
      if (!settings) settings = new Settings({ userId: user._id });
      if (input.enabledPlatforms !== undefined && input.enabledPlatforms !== null) {
        settings.enabledPlatforms = input.enabledPlatforms;
      }
      if (input.apiKeys !== undefined && input.apiKeys !== null) {
        settings.apiKeys = { ...Object.fromEntries(settings.apiKeys || new Map()), ...input.apiKeys };
      }
      if (input.preferences !== undefined && input.preferences !== null) {
        settings.preferences = { ...settings.preferences.toObject(), ...input.preferences };
      }
      await settings.save();
      await User.updateOne(
        { _id: user._id },
        {
          'settings.enabledPlatforms': settings.enabledPlatforms,
          'settings.preferences': settings.preferences,
          'settings.apiKeys': settings.apiKeys,
        }
      );
      await logActivity(user._id, 'settings_updated', {});
      return settings;
    },
    registerWebhook: async (_parent, { url, events, secret }, context) => {
      const user = requireUser(context);
      if (!/^https?:\/\/.+/i.test(url)) {
        throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 'A valid http(s) url is required');
      }
      const webhook = await Webhook.create({
        webhookId: `wh_${crypto.randomUUID()}`,
        userId: user._id,
        url,
        events: events && events.length ? events : Webhook.EVENTS,
        secret: secret || null,
        active: true,
      });
      await logActivity(user._id, 'webhook_registered', { webhookId: webhook.webhookId, url });
      return webhook;
    },
    deleteWebhook: async (_parent, { webhookId }, context) => {
      const user = requireUser(context);
      const result = await Webhook.deleteOne({ webhookId, userId: user._id });
      if (result.deletedCount === 0) {
        throw new ApiError(ERROR_CODES.WEBHOOK_NOT_FOUND, `Webhook not found: ${webhookId}`);
      }
      return true;
    },
  }),

  Subscription: {
    commandProgress: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([SUB_TOPICS.JOB_UPDATED]),
        (payload, variables, context) => {
          if (!context.user) return false;
          return payload.job.jobId === variables.jobId;
        }
      ),
      resolve: (payload) => payload.job,
    },
    processingStatus: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([SUB_TOPICS.JOB_UPDATED]),
        async (payload, _variables, context) => {
          if (!context.user) return false;
          const job = await jobService.getJobForUser(payload.job.jobId, context.user._id).catch(() => null);
          return Boolean(job);
        }
      ),
      resolve: (payload) => payload.job,
    },
  },
};

module.exports = { resolvers, pubsub, bridgeBusToPubSub };
