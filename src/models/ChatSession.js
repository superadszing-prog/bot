const mongoose = require('mongoose');

const CHAT_ROLES = ['user', 'assistant'];

const chatMessageSchema = new mongoose.Schema(
  {
    messageId: { type: String, required: true },
    role: { type: String, enum: CHAT_ROLES, required: true },
    content: { type: String, required: true, trim: true },
    suggestions: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const chatSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    messages: { type: [chatMessageSchema], default: [] },
  },
  { timestamps: true }
);

chatSessionSchema.index({ userId: 1, updatedAt: -1 });

chatSessionSchema.methods.toJSON = function toJSON() {
  return {
    sessionId: this.sessionId,
    title: this.title,
    messages: this.messages,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('ChatSession', chatSessionSchema);
