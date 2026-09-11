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

describe('LNWBOT Chat API', () => {
  test('POST /api/chat/messages creates a session and assistant reply', async () => {
    const { token } = await registerUser(app);
    const res = await request(app)
      .post('/api/chat/messages')
      .set(auth(token))
      .send({ message: 'สวัสดี LNWBOT' });

    expect(res.status).toBe(200);
    expect(res.body.data.session.sessionId).toMatch(/^chat_/);
    expect(res.body.data.session.messages).toHaveLength(2);
    expect(res.body.data.reply.role).toBe('assistant');
    expect(res.body.data.reply.content).toMatch(/LNWBOT/);
  });

  test('GET /api/chat/sessions/:sessionId returns an existing session', async () => {
    const { token } = await registerUser(app);
    const created = await request(app)
      .post('/api/chat/messages')
      .set(auth(token))
      .send({ message: 'มีคำสั่งอะไรบ้าง' });

    const sessionId = created.body.data.session.sessionId;
    const res = await request(app).get(`/api/chat/sessions/${sessionId}`).set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data.session.sessionId).toBe(sessionId);
    expect(res.body.data.session.messages[1].suggestions.length).toBeGreaterThan(0);
  });

  test("users cannot read each other's chat session", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const created = await request(app)
      .post('/api/chat/messages')
      .set(auth(a.token))
      .send({ message: 'ดูงานล่าสุด' });

    const sessionId = created.body.data.session.sessionId;
    const res = await request(app).get(`/api/chat/sessions/${sessionId}`).set(auth(b.token));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CHAT_SESSION_NOT_FOUND');
  });
});
