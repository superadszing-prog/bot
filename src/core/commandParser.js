/**
 * Thai natural-language command parser.
 *
 * Converts user commands typed in Thai (or mixed Thai/English) into a list
 * of structured action objects that the video processing pipeline can
 * execute, e.g.:
 *
 *   parseCommand('ปกป้องใบหน้า')
 *     => [{ type: 'protect', target: 'face', method: 'blur', range: null }]
 *
 *   parseCommand('เบลอทะเบียนรถ ตัดตอน 00:05-00:10')
 *     => [
 *          { type: 'protect', target: 'license_plate', method: 'blur', range: null },
 *          { type: 'trim', target: null, method: 'trim', range: { start: 5, end: 10 } }
 *        ]
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  }
  root.AIBotCommandParser = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  // Ordered so more specific phrases are matched before generic ones.
  const RULES = [
    {
      target: 'face',
      method: 'blur',
      type: 'protect',
      keywords: ['ปกป้องใบหน้า', 'เบลอใบหน้า', 'บลอใบหน้า', 'ซ่อนใบหน้า', 'blur face', 'protect face']
    },
    {
      target: 'license_plate',
      method: 'blur',
      type: 'protect',
      keywords: ['เบลอทะเบียน', 'บลอทะเบียน', 'ปกป้องทะเบียน', 'ซ่อนทะเบียน', 'blur license', 'blur plate']
    },
    {
      target: 'personal_info',
      method: 'blur',
      type: 'protect',
      keywords: ['ซ่อนข้อมูลส่วนตัว', 'ปกป้องข้อมูลส่วนตัว', 'เบลอข้อมูลส่วนตัว']
    },
    {
      target: 'face',
      method: 'pixelate',
      type: 'protect',
      keywords: ['พิกเซลใบหน้า', 'pixelate face']
    },
    {
      target: null,
      method: 'trim',
      type: 'trim',
      keywords: ['ตัดตอน', 'ตัดคลิป', 'trim']
    },
    {
      target: null,
      method: 'watermark',
      type: 'watermark',
      keywords: ['ใส่ลายน้ำ', 'เพิ่มลายน้ำ', 'watermark']
    }
  ];

  // Matches ranges like 00:05-00:10, 0:05 - 0:10, 5-10 (seconds), 00:01:05-00:01:10
  const TIME_RANGE_REGEX = /(\d{1,2}(?::\d{2}){0,2})\s*(?:-|ถึง|to)\s*(\d{1,2}(?::\d{2}){0,2})/;

  function timeToSeconds(value) {
    const parts = value.split(':').map((part) => parseInt(part, 10));
    if (parts.some((part) => Number.isNaN(part))) {
      return null;
    }
    let seconds = 0;
    for (const part of parts) {
      seconds = seconds * 60 + part;
    }
    return seconds;
  }

  function extractRange(text) {
    const match = text.match(TIME_RANGE_REGEX);
    if (!match) {
      return null;
    }
    const start = timeToSeconds(match[1]);
    const end = timeToSeconds(match[2]);
    if (start === null || end === null) {
      return null;
    }
    return { start, end };
  }

  /**
   * Parse a raw command string into structured actions.
   * @param {string} rawCommand
   * @returns {Array<{type:string,target:?string,method:string,range:?{start:number,end:number}}>}
   */
  function parseCommand(rawCommand) {
    if (!rawCommand || typeof rawCommand !== 'string') {
      return [];
    }

    const normalized = rawCommand.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    const range = extractRange(normalized);
    const actions = [];

    for (const rule of RULES) {
      for (const keyword of rule.keywords) {
        const index = normalized.indexOf(keyword.toLowerCase());
        if (index !== -1) {
          actions.push({
            type: rule.type,
            target: rule.target,
            method: rule.method,
            range: rule.type === 'trim' ? range : null
          });
          break;
        }
      }
    }

    return actions;
  }

  /**
   * Returns true if the given command string matches at least one known
   * action, useful for validating user input before dispatching.
   */
  function isRecognized(rawCommand) {
    return parseCommand(rawCommand).length > 0;
  }

  return { parseCommand, isRecognized, timeToSeconds };
});
