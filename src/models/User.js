const mongoose = require('mongoose');
const crypto = require('crypto');

const PLATFORMS = ['facebook', 'tiktok', 'instagram', 'youtube'];

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    passwordHash: { type: String, required: true, select: false },
    // SHA-256 hash of the active API key. The raw key is only shown once at creation.
    apiKeyHash: { type: String, select: false },
    name: { type: String, trim: true, maxlength: 120 },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    permissions: {
      platforms: { type: [String], enum: PLATFORMS, default: [] },
      canUploadVideo: { type: Boolean, default: true },
      canExecuteCommands: { type: Boolean, default: true },
      canManageWebhooks: { type: Boolean, default: true },
    },
    settings: {
      enabledPlatforms: { type: [String], enum: PLATFORMS, default: [] },
      preferences: {
        language: { type: String, default: 'th' },
        notifications: { type: Boolean, default: true },
        defaultBlurStrength: { type: Number, min: 1, max: 100, default: 40 },
      },
      apiKeys: { type: Map, of: String, default: {} },
    },
  },
  { timestamps: true }
);

userSchema.statics.hashApiKey = function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey)).digest('hex');
};

userSchema.statics.generateApiKey = function generateApiKey() {
  return `ak_${crypto.randomBytes(24).toString('hex')}`;
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    email: this.email,
    name: this.name,
    role: this.role,
    permissions: this.permissions,
    settings: this.settings,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('User', userSchema);
