const mongoose = require('mongoose');

const JOB_STATUSES = ['queued', 'processing', 'completed', 'failed'];

const processingJobSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    command: { type: String, required: true },
    // Parsed representation of the Thai language command
    parsedCommand: {
      action: String,
      params: mongoose.Schema.Types.Mixed,
      language: { type: String, default: 'th' },
    },
    videoId: { type: String, default: null, index: true },
    status: { type: String, enum: JOB_STATUSES, default: 'queued', index: true },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    priority: { type: Number, default: 3, min: 1, max: 5 },
    attempts: { type: Number, default: 0 },
    error: { type: String, default: null },
    results: { type: mongoose.Schema.Types.Mixed, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

processingJobSchema.index({ userId: 1, createdAt: -1 });

processingJobSchema.methods.toJSON = function toJSON() {
  return {
    jobId: this.jobId,
    command: this.command,
    parsedCommand: this.parsedCommand,
    videoId: this.videoId,
    status: this.status,
    progress: this.progress,
    priority: this.priority,
    attempts: this.attempts,
    error: this.error,
    results: this.results,
    createdAt: this.createdAt,
    startedAt: this.startedAt,
    completedAt: this.completedAt,
  };
};

module.exports = mongoose.model('ProcessingJob', processingJobSchema);
module.exports.STATUSES = JOB_STATUSES;
