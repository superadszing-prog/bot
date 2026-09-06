const request = require('supertest');
const { startTestDB, stopTestDB, clearDB, buildApp, registerUser } = require('./helpers');

let app;
beforeAll(async () => {
  await startTestDB();
  app = buildApp();
});
afterAll(stopTestDB);
beforeEach(clearDB);

const auth = (token) => ({ Authorization: 'Bearer ' + token });

describe('Settings / Permissions API', () => {
  test('POST /api/permissions/settings upserts settings and GET returns them', async () => {
    const { token } = await registerUser(app);
    const res = await request(app)
      .post('/api/permissions/settings')
      .set(auth(token))
      .send({
        enabledPlatforms: ['facebook', 'tiktok'],
        preferences: { language: 'th', defaultBlurStrength: 55 },
        apiKeys: { openai: 'sk-test' },
      });
    expect(res.status).toBe(200);
    expect(res.body.data.settings.enabledPlatforms).toEqual(['facebook', 'tiktok']);
    expect(res.body.data.settings.preferences.defaultBlurStrength).toBe(55);

    const getRes = await request(app).get('/api/permissions/settings').set(auth(token));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.settings.enabledPlatforms).toContain('facebook');
  });

  test('rejects invalid platform', async () => {
    const { token } = await registerUser(app);
    const res = await request(app)
      .post('/api/permissions/settings')
      .set(auth(token))
      .send({ enabledPlatforms: ['myspace'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('requires authentication', async () => {
    const res = await request(app).post('/api/permissions/settings').send({ enabledPlatforms: [] });
    expect(res.status).toBe(401);
  });
});

describe('History API', () => {
  test('GET /api/history/logs returns jobs and activity for the user', async () => {
    const { token } = await registerUser(app);
    await request(app).post('/api/commands/execute').set(auth(token)).send({ command: 'ซ่อนข้อมูลส่วนตัว' });

    const res = await request(app).get('/api/history/logs').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.jobs.total).toBe(1);
    expect(Array.isArray(res.body.data.activities)).toBe(true);
    expect(res.body.data.activities.some((a) => a.action === 'command_executed')).toBe(true);
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/history/logs');
    expect(res.status).toBe(401);
  });
});
