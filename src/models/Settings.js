const mongoose = require('mongoose');

const PLATFORMS = ['facebook', 'tiktok', 'instagram', 'youtube'];

/**
 * Standalone per-user settings document (keyed 1:1 with the user).
 * The embedded `settings` sub-document on User remains the quick-read cache;
 * this collection is the authoritative store exposed by the settings API.
 */
const settingsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    enabledPlatforms: { type: [String], enum: PLATFORMS, default: [] },
    apiKeys: { type: Map, of: String, default: {} },
    preferences: {
      language: { type: String, default: 'th' },
      notifications: { type: Boolean, default: true },
      defaultBlurStrength: { type: Number, min: 1, max: 100, default: 40 },
      autoProcess: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

settingsSchema.methods.toJSON = function toJSON() {
  return {
    userId: this.userId,
    enabledPlatforms: this.enabledPlatforms,
    apiKeys: Object.fromEntries(this.apiKeys || new Map()),
    preferences: this.preferences,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Settings', settingsSchema);
module.exports.PLATFORMS = PLATFORMS;
