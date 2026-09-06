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

describe('Commands API', () => {
  test('POST /api/commands/execute creates a job and processes it to completion', async () => {
    const { token } = await registerUser(app);
    const res = await request(app)
      .post('/api/commands/execute')
      .set(auth(token))
      .send({ command: 'ปกป้องใบหน้า' });
    expect(res.status).toBe(202);
    expect(res.body.data.job.status).toBe('queued');
    expect(res.body.data.job.parsedCommand.action).toBe('blur_faces');

    const jobId = res.body.data.job.jobId;
    // The simulated processor finishes quickly; poll until completed.
    let job;
    for (let i = 0; i < 40; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const statusRes = await request(app).get(`/api/commands/status/${jobId}`).set(auth(token));
      expect(statusRes.status).toBe(200);
      job = statusRes.body.data.job;
      if (job.status === 'completed') break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(job.status).toBe('completed');
    expect(job.progress).toBe(100);
    expect(job.results.action).toBe('blur_faces');
  });

  test('returns 400 with supported actions for unknown command', async () => {
    const { token } = await registerUser(app);
    const res = await request(app)
      .post('/api/commands/execute')
      .set(auth(token))
      .send({ command: 'gibberish command not supported' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_COMMAND');
    expect(Array.isArray(res.body.error.details.supportedActions)).toBe(true);
  });

  test('validates missing command', async () => {
    const { token } = await registerUser(app);
    const res = await request(app).post('/api/commands/execute').set(auth(token)).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('requires authentication', async () => {
    const res = await request(app).post('/api/commands/execute').send({ command: 'ปกป้องใบหน้า' });
    expect(res.status).toBe(401);
  });

  test('GET /api/commands/status/:jobId returns 404 for unknown job', async () => {
    const { token } = await registerUser(app);
    const res = await request(app).get('/api/commands/status/job_nope').set(auth(token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('JOB_NOT_FOUND');
  });

  test("users cannot read each other's jobs", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const created = await request(app)
      .post('/api/commands/execute')
      .set(auth(a.token))
      .send({ command: 'เบลอทะเบียนรถ' });
    const jobId = created.body.data.job.jobId;
    const res = await request(app).get(`/api/commands/status/${jobId}`).set(auth(b.token));
    expect(res.status).toBe(404);
  });
});
