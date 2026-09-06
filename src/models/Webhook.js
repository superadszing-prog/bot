const mongoose = require('mongoose');

const WEBHOOK_EVENTS = ['job_started', 'job_completed', 'job_failed', 'processing_progress'];

const webhookSchema = new mongoose.Schema(
  {
    webhookId: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    url: {
      type: String,
      required: true,
      validate: {
        validator: (value) => /^https?:\/\/.+/i.test(value),
        message: 'Webhook URL must be a valid http(s) URL',
      },
    },
    events: {
      type: [String],
      enum: WEBHOOK_EVENTS,
      default: WEBHOOK_EVENTS.slice(),
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: 'At least one webhook event is required',
      },
    },
    active: { type: Boolean, default: true },
    // Per-webhook signing secret; falls back to the global WEBHOOK_SECRET.
    secret: { type: String, default: null, select: false },
    lastDeliveryAt: { type: Date, default: null },
    lastDeliveryStatus: { type: Number, default: null },
    failureCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

webhookSchema.methods.toJSON = function toJSON() {
  return {
    webhookId: this.webhookId,
    url: this.url,
    events: this.events,
    active: this.active,
    lastDeliveryAt: this.lastDeliveryAt,
    lastDeliveryStatus: this.lastDeliveryStatus,
    failureCount: this.failureCount,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('Webhook', webhookSchema);
module.exports.EVENTS = WEBHOOK_EVENTS;
