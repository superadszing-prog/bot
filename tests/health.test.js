const request = require('supertest');
const { startTestDB, stopTestDB, clearDB, buildApp } = require('./helpers');

let app;
beforeAll(async () => {
  await startTestDB();
  app = buildApp();
});
afterAll(stopTestDB);
beforeEach(clearDB);

describe('Health & misc', () => {
  test('GET /api/health reports subsystem status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.mongo.connected).toBe(true);
    expect(res.body.data.queue).toBeDefined();
    expect(res.body.data.uptimeSec).toBeGreaterThanOrEqual(0);
  });

  test('GET / returns API info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('AI Bot API');
  });

  test('unknown routes return a structured 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
