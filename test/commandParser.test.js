const { parseCommand, isRecognized, timeToSeconds } = require('../src/core/commandParser');

describe('commandParser', () => {
  test('parses "ปกป้องใบหน้า" as a face protect/blur action', () => {
    const actions = parseCommand('ปกป้องใบหน้า');
    expect(actions).toEqual([
      { type: 'protect', target: 'face', method: 'blur', range: null }
    ]);
  });

  test('parses "เบลอทะเบียน" as a license plate protect/blur action', () => {
    const actions = parseCommand('เบลอทะเบียนรถ');
    expect(actions).toEqual([
      { type: 'protect', target: 'license_plate', method: 'blur', range: null }
    ]);
  });

  test('parses "ตัดตอน" with a time range into a trim action', () => {
    const actions = parseCommand('ตัดตอน 00:05-00:10');
    expect(actions).toEqual([
      { type: 'trim', target: null, method: 'trim', range: { start: 5, end: 10 } }
    ]);
  });

  test('normalizes reversed trim ranges so start is always <= end', () => {
    const actions = parseCommand('ตัดตอน 00:10-00:05');
    expect(actions).toEqual([
      { type: 'trim', target: null, method: 'trim', range: { start: 5, end: 10 } }
    ]);
  });

  test('parses multiple actions in a single command', () => {
    const actions = parseCommand('ปกป้องใบหน้าและเบลอทะเบียน ตัดตอน 0:05-0:15');
    expect(actions).toHaveLength(3);
    expect(actions).toEqual(
      expect.arrayContaining([
        { type: 'protect', target: 'face', method: 'blur', range: null },
        { type: 'protect', target: 'license_plate', method: 'blur', range: null },
        { type: 'trim', target: null, method: 'trim', range: { start: 5, end: 15 } }
      ])
    );
  });

  test('returns an empty array for unrecognized or empty commands', () => {
    expect(parseCommand('')).toEqual([]);
    expect(parseCommand('   ')).toEqual([]);
    expect(parseCommand(null)).toEqual([]);
    expect(parseCommand('สวัสดีครับ')).toEqual([]);
    expect(parseCommand('ใส่ลายน้ำ')).toEqual([]);
  });

  test('isRecognized reflects whether any action matched', () => {
    expect(isRecognized('ปกป้องใบหน้า')).toBe(true);
    expect(isRecognized('สวัสดีครับ')).toBe(false);
  });

  test('does not false-positive-match English keywords inside unrelated words', () => {
    expect(parseCommand('trimester')).toEqual([]);
    expect(parseCommand('this is a trim')).toEqual([
      { type: 'trim', target: null, method: 'trim', range: null }
    ]);
  });

  test('timeToSeconds supports mm:ss and hh:mm:ss', () => {
    expect(timeToSeconds('00:05')).toBe(5);
    expect(timeToSeconds('01:05')).toBe(65);
    expect(timeToSeconds('00:01:05')).toBe(65);
    expect(timeToSeconds('abc')).toBeNull();
  });
});
