const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, index: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

activityLogSchema.index({ userId: 1, timestamp: -1 });

activityLogSchema.methods.toJSON = function toJSON() {
  return {
    id: this._id,
    action: this.action,
    details: this.details,
    timestamp: this.timestamp,
  };
};

module.exports = mongoose.model('ActivityLog', activityLogSchema);
