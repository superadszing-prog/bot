const request = require('supertest');
const { startTestDB, stopTestDB, clearDB, buildApp, registerUser } = require('./helpers');

let app;

beforeAll(async () => {
  await startTestDB();
  app = buildApp();
});

afterAll(stopTestDB);
beforeEach(clearDB);

describe('Auth API', () => {
  test('POST /api/auth/register creates user and returns token + apiKey', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: 'password123', name: 'A' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.apiKey).toMatch(/^ak_/);
    expect(res.body.data.user.email).toBe('a@example.com');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  test('rejects duplicate email with EMAIL_TAKEN', async () => {
    await registerUser(app, { email: 'dup@example.com' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  test('validates registration input', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'nope', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('POST /api/auth/login returns a token for valid credentials', async () => {
    await registerUser(app, { email: 'login@example.com', password: 'password123' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  test('login rejects wrong password', async () => {
    await registerUser(app, { email: 'wrong@example.com', password: 'password123' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong@example.com', password: 'not-the-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('GET /api/auth/me works with JWT', async () => {
    const { token, user } = await registerUser(app);
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);
  });

  test('GET /api/auth/me works with API key', async () => {
    const { apiKey, user } = await registerUser(app);
    const res = await request(app).get('/api/auth/me').set('X-API-Key', apiKey);
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);
  });

  test('rejects requests without credentials', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('rejects invalid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + 'abc.' + 'def.' + 'ghi');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  test('POST /api/auth/api-key/rotate issues a new working key and retires the old one', async () => {
    const { token, apiKey } = await registerUser(app);
    const res = await request(app)
      .post('/api/auth/api-key/rotate')
      .set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(200);
    const newKey = res.body.data.apiKey;
    expect(newKey).toMatch(/^ak_/);
    expect(newKey).not.toBe(apiKey);

    const withNew = await request(app).get('/api/auth/me').set('X-API-Key', newKey);
    expect(withNew.status).toBe(200);

    const withOld = await request(app).get('/api/auth/me').set('X-API-Key', apiKey);
    expect(withOld.status).toBe(401);
  });
});
