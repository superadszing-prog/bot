/**
 * Thai language command parser.
 *
 * Supported commands (with common English aliases):
 *   ปกป้องใบหน้า / เบลอหน้า        -> blur_faces
 *   เบลอทะเบียนรถ / ปิดทะเบียน     -> blur_license_plates
 *   ซ่อนข้อมูลส่วนตัว              -> hide_personal_info
 *   ตัดวิดีโอ 00:05-00:10          -> trim_video { start, end }
 *   ลบโลโก้ / ลบลายน้ำ             -> remove_watermark
 *   ปรับความสว่าง 50               -> adjust_brightness { level }
 */
const { ApiError, ERROR_CODES } = require('../constants/errors');

const TIME_PATTERN = '(\\d{1,2}:\\d{2}(?::\\d{2})?)';
// Separator between the two timestamps: hyphen, en-dash, or the Thai word "ถึง"
const TRIM_SOURCE = `${TIME_PATTERN}\\s*(?:-|–|ถึง|to)\\s*${TIME_PATTERN}`;

const COMMAND_DEFINITIONS = [
  {
    action: 'blur_faces',
    patterns: [/ปกป้องใบหน้า/i, /เบลอ(ใบ)?หน้า/i, /ซ่อนใบหน้า/i, /\bblur faces?\b/i],
    description: 'ปกป้องใบหน้า (blur all detected faces)',
  },
  {
    action: 'blur_license_plates',
    patterns: [/เบลอทะเบียน/i, /ปิดทะเบียน/i, /ซ่อนทะเบียน/i, /\bblur (license )?plates?\b/i],
    description: 'เบลอทะเบียนรถ (blur license plates)',
  },
  {
    action: 'hide_personal_info',
    patterns: [/ซ่อนข้อมูลส่วนตัว/i, /ปกป้องข้อมูลส่วนตัว/i, /เซ็นเซอร์ข้อมูล/i, /\bhide personal info\b/i],
    description: 'ซ่อนข้อมูลส่วนตัว (hide personal information)',
  },
  {
    action: 'trim_video',
    patterns: [
      new RegExp(`ตัด(?:ตอน|วิดีโอ|คลิป)?\\s*${TRIM_SOURCE}`, 'i'),
      new RegExp(`\\btrim\\s+${TRIM_SOURCE}`, 'i'),
    ],
    description: 'ตัดวิดีโอ 00:05-00:10 (trim video between two timestamps)',
    extract: (match) => ({ start: match[1], end: match[2] }),
  },
  {
    action: 'remove_watermark',
    patterns: [/ลบโลโก้/i, /ลบลายน้ำ/i, /ซ่อนโลโก้/i, /\bremove watermark\b/i],
    description: 'ลบลายน้ำ/โลโก้ (remove watermark)',
  },
  {
    action: 'adjust_brightness',
    patterns: [/ปรับความสว่าง\s*(\d{1,3})?/i, /\bbrightness\s*(\d{1,3})?/i],
    description: 'ปรับความสว่าง 50 (adjust brightness 0-100)',
    extract: (match) => ({ level: match[1] ? Math.min(100, parseInt(match[1], 10)) : 50 }),
  },
];

/**
 * Parse a Thai (or English) natural language command.
 *
 * @param {string} command raw user command
 * @returns {{ action: string, params: object, language: string, raw: string }}
 */
function parseCommand(command) {
  if (!command || typeof command !== 'string' || !command.trim()) {
    throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 'Command must be a non-empty string');
  }

  const raw = command.trim();

  for (const definition of COMMAND_DEFINITIONS) {
    for (const pattern of definition.patterns) {
      const match = raw.match(pattern);
      if (match) {
        return {
          action: definition.action,
          params: definition.extract ? definition.extract(match) : {},
          language: /[฀-๿]/.test(raw) ? 'th' : 'en',
          raw,
        };
      }
    }
  }

  throw new ApiError(
    ERROR_CODES.UNSUPPORTED_COMMAND,
    `Unsupported command: "${raw}"`,
    { supportedActions: COMMAND_DEFINITIONS.map((d) => ({ action: d.action, description: d.description })) }
  );
}

module.exports = { parseCommand, COMMAND_DEFINITIONS };
