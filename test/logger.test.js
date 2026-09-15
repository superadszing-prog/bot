const { createLogger, LEVELS } = require('../src/utils/logger');

describe('logger', () => {
  test('exposes debug/info/warn/error methods', () => {
    const logger = createLogger('test-scope');
    LEVELS.forEach((level) => {
      expect(typeof logger[level]).toBe('function');
    });
  });

  test('records history entries with scope and level', () => {
    const logger = createLogger('test-scope', { level: 'debug' });
    logger.info('hello', { foo: 'bar' });
    const history = logger.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ level: 'info', scope: 'test-scope', message: 'hello', meta: { foo: 'bar' } });
  });

  test('respects the configured minimum level for console output but still records history', () => {
    const logger = createLogger('test-scope', { level: 'error' });
    logger.debug('should not print but should be recorded');
    expect(logger.getHistory()).toHaveLength(1);
  });

  test('caps history at maxHistory entries', () => {
    const logger = createLogger('test-scope', { maxHistory: 2 });
    logger.info('one');
    logger.info('two');
    logger.info('three');
    const history = logger.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].message).toBe('two');
    expect(history[1].message).toBe('three');
  });
});
