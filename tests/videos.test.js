const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startTestDB, stopTestDB, clearDB, buildApp, registerUser } = require('./helpers');

let app;
beforeAll(async () => {
  await startTestDB();
  app = buildApp();
});
afterAll(stopTestDB);
beforeEach(clearDB);

const auth = (token) => ({ Authorization: 'Bearer ' + token });

function makeTempVideo() {
  const file = path.join(os.tmpdir(), `test-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
  // Minimal ftyp box so it looks like an mp4
  fs.writeFileSync(file, Buffer.concat([Buffer.from('000000186674797069736f6d', 'hex'), Buffer.alloc(256, 0)]));
  return file;
}

describe('Videos API', () => {
  test('POST /api/videos/upload stores a video and returns metadata', async () => {
    const { token } = await registerUser(app);
    const file = makeTempVideo();
    const res = await request(app)
      .post('/api/videos/upload')
      .set(auth(token))
      .attach('video', file, { filename: 'clip.mp4', contentType: 'video/mp4' });
    fs.unlinkSync(file);
    expect(res.status).toBe(201);
    expect(res.body.data.video.videoId).toMatch(/^vid_/);
    expect(res.body.data.video.originalName).toBe('clip.mp4');
    expect(res.body.data.video.metadata.sizeBytes).toBeGreaterThan(0);

    // Can fetch it back
    const videoId = res.body.data.video.videoId;
    const getRes = await request(app).get(`/api/videos/${videoId}`).set(auth(token));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.video.videoId).toBe(videoId);
  });

  test('rejects non-video file types', async () => {
    const { token } = await registerUser(app);
    const file = path.join(os.tmpdir(), 'note.txt');
    fs.writeFileSync(file, 'hello');
    const res = await request(app)
      .post('/api/videos/upload')
      .set(auth(token))
      .attach('video', file, { filename: 'note.txt', contentType: 'text/plain' });
    fs.unlinkSync(file);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  test('rejects upload without a file', async () => {
    const { token } = await registerUser(app);
    const res = await request(app).post('/api/videos/upload').set(auth(token));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('GET /api/videos/:videoId returns 404 for unknown video', async () => {
    const { token } = await registerUser(app);
    const res = await request(app).get('/api/videos/vid_missing').set(auth(token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('VIDEO_NOT_FOUND');
  });

  test('GET /api/videos lists only the caller videos', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const file = makeTempVideo();
    await request(app).post('/api/videos/upload').set(auth(a.token)).attach('video', file, { filename: 'a.mp4', contentType: 'video/mp4' });
    fs.unlinkSync(file);

    const listB = await request(app).get('/api/videos').set(auth(b.token));
    expect(listB.body.data.total).toBe(0);

    const listA = await request(app).get('/api/videos').set(auth(a.token));
    expect(listA.body.data.total).toBe(1);
  });
});
