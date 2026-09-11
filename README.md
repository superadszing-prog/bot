# AI Bot — Backend API Server

Production-ready backend for the **AI Bot Browser Extension**: real-time video
processing driven by **Thai natural-language commands** for social-media
content protection (blur faces, blur license plates, hide personal info, trim,
remove watermark, adjust brightness).

Built with **Node.js + Express + GraphQL (Apollo) + MongoDB + Redis/BullMQ +
Socket.io**, with JWT & API-key auth, rate limiting, webhooks, and pluggable
file storage (local or AWS S3).

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Configuration (.env)](#configuration-env)
- [Running with Docker](#running-with-docker)
- [Database schema](#database-schema)
- [REST API reference](#rest-api-reference)
- [GraphQL reference](#graphql-reference)
- [Real-time (Socket.io)](#real-time-socketio)
- [Thai command reference](#thai-command-reference)
- [Webhooks](#webhooks)
- [Authentication](#authentication)
- [Error codes](#error-codes)
- [Testing](#testing)
- [Postman collection](#postman-collection)
- [Project structure](#project-structure)

---

## Features

- **REST API** for commands, video upload, settings, history, webhooks, health
- **LNWBOT chat API** for conversational help, command guidance, and user-aware summaries
- **GraphQL** endpoint (HTTP queries/mutations + WebSocket subscriptions)
- **Real-time** job progress via **Socket.io** and GraphQL subscriptions
- **Queue management** with BullMQ (Redis) + automatic in-memory fallback
- **Job prioritization**, retry with exponential backoff, scheduled tasks
- **JWT** and **API key** authentication
- **Rate limiting**, input validation/sanitization, CORS, Helmet, centralized errors
- **Webhooks** with HMAC-SHA256 signature verification + retry delivery
- **File storage** — local disk or AWS S3 (optional), with metadata extraction
- **Activity logging** of every meaningful action
- **LNWBOT** assistant that can explain supported commands, summarize recent jobs, and read current settings

---

## Architecture

```
┌─────────────┐   REST/GraphQL    ┌──────────────────────────────────────┐
│  Extension  │ ◄───────────────► │            Express app               │
│  / your app │                   │  auth • rate-limit • validation      │
└─────────────┘                   └───────┬──────────────────┬───────────┘
      ▲  Socket.io / WS subs              │                  │
      └───────────────────────────────────┘                  ▼
                                            ┌─────────────────────────┐
                                            │  Queue (BullMQ / Redis) │
                                            │  or in-memory fallback  │
                                            └───────────┬─────────────┘
                                                        │ process
                              ┌─────────────────────────▼───────────┐
                              │  Job lifecycle events (event bus)   │
                              └───┬──────────────┬─────────────┬────┘
                                  ▼              ▼             ▼
                            Socket.io      GraphQL subs    Webhooks
                                  │
        ┌─────────────┬───────────┴────────┬──────────────┐
        ▼             ▼                    ▼              ▼
     MongoDB        Redis               Local disk     AWS S3
   (models)      (queue/cache)         (uploads)     (optional)
```

---

## Quick start

### Prerequisites
- Node.js **>= 18**
- MongoDB (local or connection string)
- Redis (optional — without it the server uses an in-memory queue)

### Install & run

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#    -> edit .env (at minimum set JWT_SECRET, MONGODB_URI)

# 3. Start (dev, auto-reload)
npm run dev

# or production
npm start
```

The API is now at `http://localhost:3000` and GraphQL at
`http://localhost:3000/graphql`.

### First request (register → execute a Thai command)

```bash
# Register (returns a JWT and an API key)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123"}'

# Execute a Thai command (use the token from above)
curl -X POST http://localhost:3000/api/commands/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: ******" \
  -d '{"command":"ปกป้องใบหน้า"}'

# Check status
curl http://localhost:3000/api/commands/status/<jobId> \
  -H "Authorization: ******"
```

---

## Configuration (.env)

All settings come from environment variables. See [`.env.example`](.env.example)
for the full, commented list. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `MONGODB_URI` | `mongodb://localhost:27017/ai_bot` | MongoDB connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis; **empty → in-memory queue** |
| `JWT_SECRET` | — | Secret for signing JWTs (**change in prod**) |
| `JWT_EXPIRES_IN` | `7d` | JWT lifetime |
| `RATE_LIMIT_MAX` | `100` | Global requests per window |
| `RATE_LIMIT_COMMANDS_MAX` | `20` | Command/upload requests per window |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `STORAGE_DRIVER` | `local` | `local` or `s3` |
| `UPLOAD_DIR` | `uploads` | Local upload directory |
| `MAX_UPLOAD_SIZE_MB` | `500` | Max upload size |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `S3_BUCKET` | — | S3 config (when `STORAGE_DRIVER=s3`) |
| `WEBHOOK_SECRET` | — | HMAC secret for webhook signatures |
| `WEBHOOK_MAX_RETRIES` | `5` | Webhook delivery attempts |
| `SIMULATE_PROCESSING` | `true` | Simulate work (set `false` for real pipeline) |
| `LOG_LEVEL` | `info` | Winston log level |

---

## Running with Docker

```bash
# Build and start the API + MongoDB + Redis
docker compose up --build
```

Or build the API image alone (you supply Mongo/Redis):

```bash
docker build -t ai-bot-api .
docker run -p 3000:3000 \
  -e MONGODB_URI=mongodb://host.docker.internal:27017/ai_bot \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e JWT_SECRET=your-secret \
  ai-bot-api
```

---

## Database schema

Six MongoDB collections (Mongoose models in `src/models/`):

### `users`
| Field | Type | Notes |
|-------|------|-------|
| `email` | String (unique) | login |
| `passwordHash` | String | bcrypt, never selected by default |
| `apiKeyHash` | String | SHA-256 of the API key (raw key shown once) |
| `name`, `role` | String | `role`: `user`/`admin` |
| `permissions` | Object | `platforms[]`, `canUploadVideo`, `canExecuteCommands`, `canManageWebhooks` |
| `settings` | Object | embedded cache of `enabledPlatforms`, `preferences`, `apiKeys` |

### `processingjobs`
| Field | Type |
|-------|------|
| `jobId` | String (unique) |
| `userId` | ObjectId → users |
| `command` | String (raw Thai command) |
| `parsedCommand` | `{ action, params, language }` |
| `videoId` | String (nullable) |
| `status` | `queued`/`processing`/`completed`/`failed` |
| `progress` | Number 0–100 |
| `priority`, `attempts`, `error`, `results` | mixed |
| `createdAt`, `startedAt`, `completedAt` | Date |

### `videos`
`videoId` (unique), `fileName`, `originalName`, `fileSize`, `mimeType`,
`uploadedBy`, `storageDriver`, `storageUrl`, `storageKey`,
`metadata{durationSec,width,height,format,sizeBytes}`, `status`.

### `webhooks`
`webhookId` (unique), `userId`, `url`, `events[]`, `active`, `secret`,
`lastDeliveryAt`, `lastDeliveryStatus`, `failureCount`.

### `activitylogs`
`userId`, `action`, `details`, `ip`, `userAgent`, `timestamp`.

### `settings`
`userId` (unique), `enabledPlatforms[]`, `apiKeys` (map), `preferences{}`.

> **Migrations:** Mongoose creates collections and indexes automatically on
> first use (`autoIndex` enabled outside production). For production index
> builds, run `node -e "require('./src/db/connection').connectDatabase().then(()=>process.exit())"`
> with `NODE_ENV=production` after deploying, or manage indexes via your
> usual MongoDB migration tooling.

---

## REST API reference

Base URL: `/api`. All responses use a consistent envelope:

```jsonc
// success
{ "success": true, "data": { /* ... */ } }
// error
{ "success": false, "error": { "code": "ERROR_CODE", "message": "...", "details": {} } }
```

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account. Returns `{ user, apiKey, token }` |
| POST | `/api/auth/login` | Login. Returns `{ user, token }` |
| GET | `/api/auth/me` | Current user (JWT or API key) |
| POST | `/api/auth/api-key/rotate` | Issue a new API key (retires the old one) |

### Commands

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/commands/execute` | Execute a Thai command → creates a job (202) |
| GET | `/api/commands/status/:jobId` | Job status/progress/results |

### LNWBOT chat

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat/messages` | Send a message to LNWBOT and receive an assistant reply |
| GET | `/api/chat/sessions` | List your chat sessions |
| GET | `/api/chat/sessions/:sessionId` | Read a chat session and its messages |

```bash
curl -X POST http://localhost:3000/api/chat/messages \
  -H "Authorization: ******" \
  -H "Content-Type: application/json" \
  -d '{"message":"มีคำสั่งอะไรบ้าง"}'
```

**Execute example**
```bash
curl -X POST http://localhost:3000/api/commands/execute \
  -H "Authorization: ******" -H "Content-Type: application/json" \
  -d '{"command":"ตัดตอน 00:05-00:10","videoId":"vid_...","priority":1}'
```
```json
{ "success": true, "data": { "job": {
  "jobId": "job_…", "status": "queued", "progress": 0,
  "parsedCommand": { "action": "trim_video", "params": { "start": "00:05", "end": "00:10" }, "language": "th" }
} } }
```

### Videos

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/videos/upload` | Multipart upload (field `video`) → metadata (201) |
| GET | `/api/videos/:videoId` | Video metadata |
| GET | `/api/videos` | List your videos (paginated) |

```bash
curl -X POST http://localhost:3000/api/videos/upload \
  -H "Authorization: ******" -F "video=@clip.mp4"
```

### Settings / permissions

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/permissions/settings` | Upsert settings (platforms, apiKeys, preferences) |
| GET | `/api/permissions/settings` | Read current settings |

### History

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/history/logs` | Your processing jobs + activity logs (paginated) |

Query params: `page`, `limit`, and `status` (filter jobs by status).

### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/webhooks/register` | Register a webhook |
| GET | `/api/webhooks` | List your webhooks |
| DELETE | `/api/webhooks/:webhookId` | Delete a webhook |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Liveness/readiness: uptime, Mongo + queue status |

---

## GraphQL reference

Endpoint: `POST /graphql` (queries/mutations) and `ws://<host>/graphql`
(subscriptions via `graphql-ws`). Send `Authorization: ****** (or
`X-API-Key`) header / `connectionParams` for auth.

### Queries
```graphql
getCommandStatus(jobId: ID!): Job!
getVideoMetadata(videoId: ID!): Video!
getUserSettings: Settings
getProcessingHistory(page: Int, limit: Int, status: JobStatus): JobPage!
getActivityLogs(page: Int, limit: Int): [ActivityLogEntry!]!
getQueueStats: JSON!
getChatSessions: [ChatSession!]!
getChatSession(sessionId: ID!): ChatSession!
```

### Mutations
```graphql
executeCommand(command: String!, videoId: ID, priority: Int): Job!
sendChatMessage(message: String!, sessionId: ID): ChatReplyPayload!
uploadVideo(videoId: ID!): UploadPayload!      # link an uploaded video into workspace
updateSettings(input: SettingsInput!): Settings!
registerWebhook(url: String!, events: [String!], secret: String): Webhook!
deleteWebhook(webhookId: ID!): Boolean!
```

### Subscriptions (real-time)
```graphql
subscription { commandProgress(jobId: "job_…") { status progress results } }
subscription { processingStatus { jobId status progress } }
```

**Example**
```graphql
mutation {
  executeCommand(command: "ปกป้องใบหน้า") {
    jobId status parsedCommand { action }
  }
}
```

---

## Real-time (Socket.io)

Connect to `/socket.io` with auth:

```js
const { io } = require('socket.io-client');
const socket = io('http://localhost:3000', { auth: { token } });

socket.on('connect', () => {
  socket.emit('subscribe_job', 'job_…', (ack) => console.log(ack));
});
socket.on('processing_progress', ({ job }) => console.log(job.progress));
socket.on('job_started',    ({ job }) => {});
socket.on('job_completed',  ({ job }) => console.log(job.results));
socket.on('job_failed',     ({ job }) => console.log(job.error));
```

Events mirror the webhook event types. You can also authenticate with
`auth: { apiKey }`.

---

## Thai command reference

| Thai command | English alias | Action | Params |
|--------------|---------------|--------|--------|
| `ปกป้องใบหน้า` | `blur faces` | `blur_faces` | — |
| `เบลอทะเบียนรถ` | `blur license plates` | `blur_license_plates` | — |
| `ซ่อนข้อมูลส่วนตัว` | `hide personal info` | `hide_personal_info` | — |
| `ตัดตอน 00:05-00:10` | `trim 00:05 to 00:10` | `trim_video` | `{start,end}` |
| `ลบลายน้ำ` / `ลบโลโก้` | `remove watermark` | `remove_watermark` | — |
| `ปรับความสว่าง 70` | `brightness 70` | `adjust_brightness` | `{level}` |

Unsupported commands return `400 UNSUPPORTED_COMMAND` with the list of
supported actions.

---

## Webhooks

Register a URL to receive job lifecycle events: `job_started`,
`job_completed`, `job_failed`, `processing_progress`.

**Payload** (POST, `Content-Type: application/json`):
```json
{
  "event": "job_completed",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "data": { "job": { "jobId": "job_…", "status": "completed", "progress": 100 } }
}
```

**Signature verification** — every delivery includes
`X-Webhook-Signature: sha256=<hmac>`. Verify with your webhook secret (or the
global `WEBHOOK_SECRET`):

```js
const crypto = require('crypto');
const expected = crypto.createHmac('sha256', SECRET)
  .update(JSON.stringify(req.body)).digest('hex');
const valid = crypto.timingSafeEqual(
  Buffer.from(req.headers['x-webhook-signature'].replace('sha256=', '')),
  Buffer.from(expected)
);
```

Deliveries retry with exponential backoff up to `WEBHOOK_MAX_RETRIES` times.

---

## Authentication

Two methods (use either):

1. **JWT** — `Authorization: ****** (from `/api/auth/register` or `/login`)
2. **API key** — `X-API-Key: ak_…` (issued at registration; rotate via
   `/api/auth/api-key/rotate`)

Rate limiting is applied per user (or per IP when unauthenticated).

---

## Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `BAD_REQUEST` | 400 | Malformed input |
| `UNSUPPORTED_COMMAND` | 400 | Unknown Thai command |
| `INVALID_FILE_TYPE` | 400 | Unsupported upload type |
| `UNAUTHORIZED` | 401 | No credentials provided |
| `TOKEN_INVALID` / `TOKEN_EXPIRED` | 401 | Bad/expired JWT |
| `API_KEY_INVALID` | 401 | Bad API key |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `FORBIDDEN` | 403 | Missing permission |
| `NOT_FOUND` | 404 | Route not found |
| `JOB_NOT_FOUND` / `VIDEO_NOT_FOUND` / `WEBHOOK_NOT_FOUND` | 404 | Resource missing |
| `EMAIL_TAKEN` | 409 | Email already registered |
| `PAYLOAD_TOO_LARGE` | 413 | Upload too large |
| `RATE_LIMITED` | 429 | Too many requests |
| `STORAGE_ERROR` | 502 | Storage backend failure |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Testing

```bash
# Start MongoDB + Redis (Docker) for the integration tests
docker run -d -p 27017:27017 mongo:7
docker run -d -p 6379:6379 redis:7-alpine

npm test
```

The suite uses a real MongoDB when available (set `TEST_MONGODB_URI`), and
falls back to `mongodb-memory-server` otherwise. Redis is not required — the
queue uses the in-memory driver during tests. Covers auth, commands, videos,
settings/history, webhooks (incl. signature verification), health, GraphQL,
and the Thai command parser.

---

## Postman collection

Import [`postman/ai-bot-api.postman_collection.json`](postman/ai-bot-api.postman_collection.json)
into Postman. It includes every endpoint with example bodies and uses
collection variables (`baseUrl`, `token`, `apiKey`) so you can authenticate
once and reuse it.

---

## Project structure

```
src/
├── index.js            # entrypoint (boot + signals)
├── server.js           # startServer(): mongo → queue → http → graphql → socket.io
├── app.js              # Express app assembly
├── config/             # env config + winston logger
├── constants/          # error codes
├── db/connection.js    # mongoose connect/disconnect
├── models/             # User, ProcessingJob, Video, Webhook, ActivityLog, Settings
├── middleware/         # auth (JWT+API key), rate limit, validation, errors
├── routes/             # auth, commands, videos, permissions, history, webhooks, health
├── services/           # jobService, authService, storageService, webhookService, activityService
├── queue/              # BullMQ + in-memory fallback
├── graphql/            # typeDefs, resolvers, Apollo server (HTTP + WS subs)
├── websocket/          # Socket.io real-time bridge
└── utils/              # thaiCommands parser, event bus
tests/                  # Jest + Supertest suites
postman/                # Postman collection
Dockerfile, docker-compose.yml, .env.example
```
