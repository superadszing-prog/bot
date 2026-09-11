const request = require('supertest');
const { startTestDB, stopTestDB, clearDB, registerUser } = require('./helpers');

// Build the real app with GraphQL injected at construction time (so /graphql
// is mounted before the 404 handler).
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const typeDefs = require('../src/graphql/typeDefs');
const { resolvers } = require('../src/graphql/resolvers');
const { createApp } = require('../src/app');

let app;
let apollo;

beforeAll(async () => {
  await startTestDB();
  const schema = makeExecutableSchema({ typeDefs, resolvers });
  apollo = new ApolloServer({ schema });
  await apollo.start();
  const middleware = expressMiddleware(apollo, { context: async ({ req }) => ({ user: req.user || null }) });
  app = createApp({ graphqlMiddleware: middleware });
});

afterAll(async () => {
  if (apollo) await apollo.stop();
  await stopTestDB();
});
beforeEach(clearDB);

const gql = (query, variables, token) => {
  const r = request(app).post('/graphql').send({ query, variables });
  if (token) r.set('Authorization', 'Bearer ' + token);
  return r;
};

describe('GraphQL API', () => {
  test('executeCommand mutation creates and completes a job, getCommandStatus reads it', async () => {
    const { token } = await registerUser(app);
    const m = await gql(
      'mutation($c: String!) { executeCommand(command: $c) { jobId status parsedCommand { action } } }',
      { c: 'ปกป้องใบหน้า' },
      token
    );
    expect(m.status).toBe(200);
    expect(m.body.errors).toBeUndefined();
    const jobId = m.body.data.executeCommand.jobId;
    expect(m.body.data.executeCommand.parsedCommand.action).toBe('blur_faces');

    let job;
    for (let i = 0; i < 40; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const q = await gql('query($j: ID!) { getCommandStatus(jobId: $j) { status progress } }', { j: jobId }, token);
      job = q.body.data.getCommandStatus;
      if (job.status === 'completed') break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(job.status).toBe('completed');
  });

  test('updateSettings + getUserSettings round-trip', async () => {
    const { token } = await registerUser(app);
    await gql(
      'mutation { updateSettings(input: { enabledPlatforms: ["tiktok"] }) { enabledPlatforms } }',
      {},
      token
    );
    const q = await gql('query { getUserSettings { enabledPlatforms } }', {}, token);
    expect(q.body.data.getUserSettings.enabledPlatforms).toEqual(['tiktok']);
  });

  test('registerWebhook mutation returns webhookId', async () => {
    const { token } = await registerUser(app);
    const m = await gql(
      'mutation { registerWebhook(url: "https://example.com/h", events: ["job_completed"]) { webhookId events } }',
      {},
      token
    );
    expect(m.body.errors).toBeUndefined();
    expect(m.body.data.registerWebhook.webhookId).toMatch(/^wh_/);
  });

  test('sendChatMessage mutation creates a LNWBOT session and getChatSession reads it', async () => {
    const { token } = await registerUser(app);
    const created = await gql(
      'mutation($message: String!) { sendChatMessage(message: $message) { session { sessionId title messages { role } } reply { role content } } }',
      { message: 'มีคำสั่งอะไรบ้าง' },
      token
    );
    expect(created.body.errors).toBeUndefined();
    const sessionId = created.body.data.sendChatMessage.session.sessionId;
    expect(created.body.data.sendChatMessage.reply.content).toMatch(/LNWBOT|คำสั่ง/);

    const fetched = await gql(
      'query($sessionId: ID!) { getChatSession(sessionId: $sessionId) { sessionId messages { role content } } }',
      { sessionId },
      token
    );
    expect(fetched.body.errors).toBeUndefined();
    expect(fetched.body.data.getChatSession.messages).toHaveLength(2);
  });

  test('unauthenticated queries are rejected with UNAUTHORIZED', async () => {
    const q = await gql('query { getUserSettings { enabledPlatforms } }', {});
    expect(q.body.errors).toBeDefined();
    expect(q.body.errors[0].extensions.code).toBe('UNAUTHORIZED');
  });

  test('getProcessingHistory returns a page shape', async () => {
    const { token } = await registerUser(app);
    await gql('mutation($c: String!) { executeCommand(command: $c) { jobId } }', { c: 'ลบลายน้ำ' }, token);
    const q = await gql('query { getProcessingHistory { total page pages } }', {}, token);
    expect(q.body.data.getProcessingHistory.total).toBeGreaterThanOrEqual(1);
  });
});
