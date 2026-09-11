const crypto = require('crypto');
const ChatSession = require('../models/ChatSession');
const ProcessingJob = require('../models/ProcessingJob');
const Settings = require('../models/Settings');
const { COMMAND_DEFINITIONS, parseCommand } = require('../utils/thaiCommands');
const { ApiError, ERROR_CODES } = require('../constants/errors');
const { asString } = require('../utils/sanitize');

function buildTitle(message) {
  const compact = message.replace(/\s+/g, ' ').trim();
  return compact.length > 60 ? `${compact.slice(0, 57)}...` : compact;
}

function createMessage(role, content, suggestions = []) {
  return {
    messageId: `msg_${crypto.randomUUID()}`,
    role,
    content,
    suggestions,
    createdAt: new Date(),
  };
}

function buildCommandSuggestions() {
  return COMMAND_DEFINITIONS.slice(0, 3).map((definition) => definition.description);
}

async function buildAssistantReply(userId, message) {
  const [settings, recentJobs] = await Promise.all([
    Settings.findOne({ userId }),
    ProcessingJob.find({ userId }).sort({ createdAt: -1 }).limit(3),
  ]);

  const trimmed = message.trim();
  if (/^(hi|hello|hey|สวัสดี|หวัดดี)/i.test(trimmed)) {
    return {
      content: 'สวัสดีครับ ผมคือ LNWBOT ผู้ช่วย AI สำหรับงานวิดีโอของคุณ ช่วยแนะนำคำสั่ง ติดตามงานล่าสุด และสรุปการตั้งค่าให้ได้ทันที',
      suggestions: ['ปกป้องใบหน้า', 'เบลอทะเบียนรถ', 'ดูงานล่าสุด'],
    };
  }

  if (/(ช่วย|help|ทำอะไรได้|ใช้งานยังไง|คำสั่ง)/i.test(trimmed)) {
    return {
      content: `LNWBOT ช่วยคุณได้ทั้งแนะนำคำสั่งวิดีโอภาษาไทย ตอบวิธีใช้งาน และสรุปงานล่าสุด คำสั่งที่รองรับตอนนี้คือ ${COMMAND_DEFINITIONS.map((definition) => definition.description).join(', ')}`,
      suggestions: buildCommandSuggestions(),
    };
  }

  if (/(สถานะ|งานล่าสุด|history|ล่าสุด|job)/i.test(trimmed)) {
    if (!recentJobs.length) {
      return {
        content: 'ตอนนี้ยังไม่มีประวัติงานประมวลผลในบัญชีนี้ คุณสามารถเริ่มได้ด้วยคำสั่ง เช่น "ปกป้องใบหน้า" หรือ "ลบลายน้ำ"',
        suggestions: buildCommandSuggestions(),
      };
    }

    const summary = recentJobs
      .map((job) => `${job.command} → ${job.status} (${job.progress}%)`)
      .join(' | ');

    return {
      content: `สรุปงานล่าสุดของคุณ: ${summary}`,
      suggestions: ['ตรวจสอบสถานะงาน', 'ปกป้องใบหน้า', 'ลบลายน้ำ'],
    };
  }

  if (/(ตั้งค่า|settings|platform|แพลตฟอร์ม|preference)/i.test(trimmed)) {
    const platforms = settings && settings.enabledPlatforms.length ? settings.enabledPlatforms.join(', ') : 'ยังไม่ได้เลือก';
    const language = settings && settings.preferences && settings.preferences.language ? settings.preferences.language : 'th';
    return {
      content: `การตั้งค่าปัจจุบันของคุณ: ภาษา ${language}, แพลตฟอร์มที่เปิดใช้งาน ${platforms}`,
      suggestions: ['อัปเดตการตั้งค่า', 'ดูงานล่าสุด', 'คำสั่งที่รองรับ'],
    };
  }

  try {
    const parsed = parseCommand(trimmed);
    const paramsText = parsed.params && Object.keys(parsed.params).length
      ? ` พร้อมพารามิเตอร์ ${JSON.stringify(parsed.params)}`
      : '';
    return {
      content: `LNWBOT เข้าใจว่าคุณต้องการใช้คำสั่ง ${parsed.action}${paramsText} คุณสามารถส่งคำสั่งนี้ไปที่ /api/commands/execute ได้ทันที`,
      suggestions: ['ส่งคำสั่งนี้ไปประมวลผล', 'ดูสถานะงานล่าสุด', 'คำสั่งอื่นที่รองรับ'],
    };
  } catch (err) {
    if (err.code !== ERROR_CODES.UNSUPPORTED_COMMAND && err.code !== ERROR_CODES.VALIDATION_ERROR) {
      throw err;
    }
  }

  return {
    content: 'LNWBOT พร้อมช่วยเรื่องงานวิดีโอภาษาไทย ถ้าต้องการเริ่มเร็ว ลองพิมพ์คำสั่งอย่าง "ปกป้องใบหน้า", "ตัดตอน 00:05-00:10" หรือถามผมว่า "มีคำสั่งอะไรบ้าง"',
    suggestions: buildCommandSuggestions(),
  };
}

async function getChatSessionForUser(sessionId, userId) {
  const session = await ChatSession.findOne({ sessionId: asString(sessionId), userId });
  if (!session) throw new ApiError(ERROR_CODES.CHAT_SESSION_NOT_FOUND, `Chat session not found: ${sessionId}`);
  return session;
}

async function listChatSessionsForUser(userId) {
  return ChatSession.find({ userId }).sort({ updatedAt: -1 });
}

async function sendMessage({ userId, message, sessionId = null }) {
  const content = asString(message) && message.trim();
  if (!content) throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 'message must be a non-empty string');

  const safeSessionId = asString(sessionId);
  const session = safeSessionId
    ? await getChatSessionForUser(safeSessionId, userId)
    : new ChatSession({
      sessionId: `chat_${crypto.randomUUID()}`,
      userId,
      title: buildTitle(content),
      messages: [],
    });

  const userMessage = createMessage('user', content);
  const assistantReply = await buildAssistantReply(userId, content);
  const replyMessage = createMessage('assistant', assistantReply.content, assistantReply.suggestions);

  session.messages.push(userMessage, replyMessage);
  if (!session.title) session.title = buildTitle(content);
  await session.save();

  return { session, reply: replyMessage };
}

module.exports = {
  getChatSessionForUser,
  listChatSessionsForUser,
  sendMessage,
};
