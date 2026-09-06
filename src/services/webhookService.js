const crypto = require('crypto');
const Webhook = require('../models/Webhook');
const config = require('../config');
const logger = require('../config/logger');
const { bus, EVENTS } = require('../utils/eventBus');

const MAX_RESPONSE_LOG = 500;

function signPayload(payload, secret = config.webhooks.secret) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

/**
 * Verify an inbound webhook signature (used by consumers and by our own tests).
 */
function verifySignature(payload, signature, secret = config.webhooks.secret) {
  const expected = signPayload(payload, secret);
  const a = Buffer.from(String(signature || ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function deliverOnce(webhook, event, payload) {
  const secret = webhook.secret || config.webhooks.secret;
  const body = JSON.stringify(payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.webhooks.timeoutMs);

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': event,
        'X-Webhook-Signature': `sha256=${signPayload(payload, secret)}`,
        'X-Webhook-Id': webhook.webhookId,
      },
      body,
      signal: controller.signal,
    });
    const text = (await response.text()).slice(0, MAX_RESPONSE_LOG);
    return { ok: response.ok, status: response.status, body: text };
  } catch (err) {
    return { ok: false, status: 0, body: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deliver an event to one webhook with exponential-backoff retries.
 */
async function deliverWithRetry(webhook, event, payload) {
  for (let attempt = 1; attempt <= config.webhooks.maxRetries; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await deliverOnce(webhook, event, payload);
    if (result.ok) {
      await Webhook.updateOne(
        { _id: webhook._id },
        { lastDeliveryAt: new Date(), lastDeliveryStatus: result.status, failureCount: 0 }
      );
      return result;
    }
    logger.warn('Webhook delivery failed', {
      webhookId: webhook.webhookId, event, attempt, status: result.status,
    });
    if (attempt < config.webhooks.maxRetries) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, Math.min(2 ** attempt * 250, 10000)));
    }
  }

  await Webhook.updateOne(
    { _id: webhook._id },
    { $inc: { failureCount: 1 }, lastDeliveryAt: new Date(), lastDeliveryStatus: 0 }
  );
  return { ok: false, status: 0 };
}

/**
 * Fan out an event to every active webhook subscribed to it.
 */
async function dispatchEvent(event, data) {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };
  const webhooks = await Webhook.find({ active: true, events: event }).select('+secret');
  await Promise.allSettled(webhooks.map((hook) => deliverWithRetry(hook, event, payload)));
  return webhooks.length;
}

let listenersAttached = false;

/**
 * Subscribe the webhook dispatcher to the internal event bus.
 * Called once during server startup.
 */
function startWebhookDispatcher() {
  if (listenersAttached) return;
  listenersAttached = true;

  const forward = (event) => {
    bus.on(event, ({ job }) => {
      dispatchEvent(event, { job }).catch((err) => logger.error('Webhook dispatch error', { error: err.message }));
    });
  };

  forward(EVENTS.JOB_STARTED);
  forward(EVENTS.JOB_COMPLETED);
  forward(EVENTS.JOB_FAILED);
  forward(EVENTS.PROCESSING_PROGRESS);
  logger.info('Webhook dispatcher started');
}

module.exports = { dispatchEvent, deliverWithRetry, signPayload, verifySignature, startWebhookDispatcher };
