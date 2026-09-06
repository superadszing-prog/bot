const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema(
  {
    videoId: { type: String, required: true, unique: true, index: true },
    fileName: { type: String, required: true },
    originalName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    storageDriver: { type: String, enum: ['local', 's3'], default: 'local' },
    storageUrl: { type: String, required: true },
    storageKey: { type: String, default: null },
    metadata: {
      durationSec: { type: Number, default: null },
      width: { type: Number, default: null },
      height: { type: Number, default: null },
      format: { type: String, default: null },
      sizeBytes: { type: Number, default: null },
    },
    status: { type: String, enum: ['uploaded', 'processing', 'ready', 'failed'], default: 'uploaded' },
  },
  { timestamps: true }
);

videoSchema.index({ uploadedBy: 1, createdAt: -1 });

videoSchema.methods.toJSON = function toJSON() {
  return {
    videoId: this.videoId,
    fileName: this.fileName,
    originalName: this.originalName,
    fileSize: this.fileSize,
    mimeType: this.mimeType,
    metadata: this.metadata,
    storageUrl: this.storageUrl,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Video', videoSchema);
