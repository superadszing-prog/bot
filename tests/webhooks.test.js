const request = require('supertest');
const express = require('express');
const { startTestDB, stopTestDB, clearDB, buildApp, listen, registerUser } = require('./helpers');
const { verifySignature, dispatchEvent } = require('../src/services/webhookService');

let app;
beforeAll(async () => {
  await startTestDB();
  app = buildApp();
});
afterAll(stopTestDB);
beforeEach(clearDB);

const auth = (token) => ({ Authorization: 'Bearer ' + token });

describe('Webhooks API', () => {
  test('POST /api/webhooks/register creates a webhook', async () => {
    const { token } = await registerUser(app);
    const res = await request(app)
      .post('/api/webhooks/register')
      .set(auth(token))
      .send({ url: 'https://example.com/hook', events: ['job_completed'] });
    expect(res.status).toBe(201);
    expect(res.body.data.webhook.webhookId).toMatch(/^wh_/);
    expect(res.body.data.webhook.events).toEqual(['job_completed']);
    expect(res.body.data.webhook.active).toBe(true);
  });

  test('rejects invalid url and events', async () => {
    const { token } = await registerUser(app);
    const bad = await request(app).post('/api/webhooks/register').set(auth(token)).send({ url: 'not-a-url' });
    expect(bad.status).toBe(400);

    const badEvent = await request(app)
      .post('/api/webhooks/register')
      .set(auth(token))
      .send({ url: 'https://example.com/h', events: ['nope'] });
    expect(badEvent.status).toBe(400);
  });

  test('list and delete webhooks', async () => {
    const { token } = await registerUser(app);
    const created = await request(app)
      .post('/api/webhooks/register')
      .set(auth(token))
      .send({ url: 'https://example.com/hook' });
    const webhookId = created.body.data.webhook.webhookId;

    const list = await request(app).get('/api/webhooks').set(auth(token));
    expect(list.body.data.webhooks).toHaveLength(1);

    const del = await request(app).delete(`/api/webhooks/${webhookId}`).set(auth(token));
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);

    const delAgain = await request(app).delete(`/api/webhooks/${webhookId}`).set(auth(token));
    expect(delAgain.status).toBe(404);
  });

  test('delivers an event with a verifiable signature', async () => {
    // Local receiver
    const received = [];
    const receiver = express();
    receiver.use(express.json());
    receiver.post('/hook', (req, res) => {
      received.push({ headers: req.headers, body: req.body });
      res.status(200).send('ok');
    });
    const { server, port } = await listen(receiver);

    try {
      const { token } = await registerUser(app);
      await request(app)
        .post('/api/webhooks/register')
        .set(auth(token))
        .send({ url: `http://127.0.0.1:${port}/hook`, events: ['job_completed'] });

      const count = await dispatchEvent('job_completed', { job: { jobId: 'job_test_123', status: 'completed' } });
      expect(count).toBe(1);
      expect(received).toHaveLength(1);

      const sig = received[0].headers['x-webhook-signature'];
      expect(sig).toMatch(/^sha256=/);
      const valid = verifySignature(received[0].body, sig.replace('sha256=', ''));
      expect(valid).toBe(true);
      expect(received[0].body.event).toBe('job_completed');
      expect(received[0].body.data.job.jobId).toBe('job_test_123');
    } finally {
      server.close();
    }
  });

  test('verifySignature rejects tampered payloads', () => {
    const payload = { event: 'job_completed', data: { job: { jobId: 'x' } } };
    const { signPayload } = require('../src/services/webhookService');
    const sig = signPayload(payload);
    expect(verifySignature(payload, sig)).toBe(true);
    expect(verifySignature({ ...payload, tampered: true }, sig)).toBe(false);
    expect(verifySignature(payload, 'deadbeef')).toBe(false);
  });
});
