// Shared Jest setup: runs before each test file.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';
process.env.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'test-webhook-secret';
process.env.SIMULATE_PROCESSING = 'true';
process.env.REDIS_URL = ''; // force in-memory queue in tests

jest.setTimeout(30000);
