const { parseCommand } = require('../src/utils/thaiCommands');
const { ApiError } = require('../src/constants/errors');

describe('Thai command parser', () => {
  test('parses ปกป้องใบหน้า as blur_faces', () => {
    const result = parseCommand('ปกป้องใบหน้า');
    expect(result.action).toBe('blur_faces');
    expect(result.language).toBe('th');
  });

  test('parses เบลอทะเบียนรถ as blur_license_plates', () => {
    expect(parseCommand('เบลอทะเบียนรถ').action).toBe('blur_license_plates');
  });

  test('parses ซ่อนข้อมูลส่วนตัว as hide_personal_info', () => {
    expect(parseCommand('ซ่อนข้อมูลส่วนตัว').action).toBe('hide_personal_info');
  });

  test('parses trim command with time range', () => {
    const result = parseCommand('ตัดตอน 00:05-00:10');
    expect(result.action).toBe('trim_video');
    expect(result.params).toEqual({ start: '00:05', end: '00:10' });
  });

  test('parses trim with ถึง separator and hh:mm:ss', () => {
    const result = parseCommand('ตัดวิดีโอ 00:00:05 ถึง 00:01:30');
    expect(result.action).toBe('trim_video');
    expect(result.params).toEqual({ start: '00:00:05', end: '00:01:30' });
  });

  test('parses ลบลายน้ำ as remove_watermark', () => {
    expect(parseCommand('ลบลายน้ำ').action).toBe('remove_watermark');
  });

  test('parses brightness with level', () => {
    const result = parseCommand('ปรับความสว่าง 70');
    expect(result.action).toBe('adjust_brightness');
    expect(result.params.level).toBe(70);
  });

  test('supports English alias', () => {
    expect(parseCommand('blur faces').action).toBe('blur_faces');
    expect(parseCommand('blur faces').language).toBe('en');
  });

  test('throws VALIDATION_ERROR on empty input', () => {
    expect(() => parseCommand('')).toThrow(ApiError);
    expect(() => parseCommand('   ')).toThrow(ApiError);
  });

  test('throws UNSUPPORTED_COMMAND on unknown command', () => {
    try {
      parseCommand('ทำอะไรก็ได้ที่ไม่รู้จัก');
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.code).toBe('UNSUPPORTED_COMMAND');
      expect(err.details.supportedActions.length).toBeGreaterThan(0);
    }
  });
});
