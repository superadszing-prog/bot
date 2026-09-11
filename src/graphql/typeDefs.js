const typeDefs = /* GraphQL */ `
  scalar JSON
  scalar DateTime

  enum JobStatus {
    queued
    processing
    completed
    failed
  }

  type ParsedCommand {
    action: String!
    params: JSON
    language: String
  }

  type Job {
    jobId: ID!
    command: String!
    parsedCommand: ParsedCommand
    videoId: ID
    status: JobStatus!
    progress: Int!
    priority: Int
    attempts: Int
    error: String
    results: JSON
    createdAt: DateTime
    startedAt: DateTime
    completedAt: DateTime
  }

  type JobPage {
    items: [Job!]!
    total: Int!
    page: Int!
    pages: Int!
  }

  type VideoMetadata {
    durationSec: Float
    width: Int
    height: Int
    format: String
    sizeBytes: Int
  }

  type Video {
    videoId: ID!
    fileName: String!
    originalName: String!
    fileSize: Int!
    mimeType: String!
    metadata: VideoMetadata
    storageUrl: String!
    status: String!
    createdAt: DateTime
  }

  type Preferences {
    language: String
    notifications: Boolean
    defaultBlurStrength: Int
    autoProcess: Boolean
  }

  type Settings {
    enabledPlatforms: [String!]!
    apiKeys: JSON
    preferences: Preferences
  }

  type Webhook {
    webhookId: ID!
    url: String!
    events: [String!]!
    active: Boolean!
    lastDeliveryAt: DateTime
    lastDeliveryStatus: Int
    failureCount: Int
    createdAt: DateTime
  }

  type ActivityLogEntry {
    id: ID!
    action: String!
    details: JSON
    timestamp: DateTime
  }

  type UploadPayload {
    video: Video!
  }

  input SettingsInput {
    enabledPlatforms: [String!]
    apiKeys: JSON
    preferences: JSON
  }

  type Query {
    getCommandStatus(jobId: ID!): Job!
    getVideoMetadata(videoId: ID!): Video!
    getUserSettings: Settings
    getProcessingHistory(page: Int = 1, limit: Int = 20, status: JobStatus): JobPage!
    getActivityLogs(page: Int = 1, limit: Int = 20): [ActivityLogEntry!]!
    getQueueStats: JSON!
  }

  type Mutation {
    executeCommand(command: String!, videoId: ID, priority: Int): Job!
    uploadVideo(videoId: ID!): UploadPayload!
    updateSettings(input: SettingsInput!): Settings!
    registerWebhook(url: String!, events: [String!], secret: String): Webhook!
    deleteWebhook(webhookId: ID!): Boolean!
  }

  type Subscription {
    commandProgress(jobId: ID!): Job!
    processingStatus: Job!
  }
`;

module.exports = typeDefs;
