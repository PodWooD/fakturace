const bullmq = require('bullmq');

const { Queue, Worker, QueueEvents } = bullmq;
const QueueScheduler =
  bullmq.QueueScheduler ||
  class QueueSchedulerCompat {
    constructor(name, opts = {}) {
      this.name = name;
      this.opts = opts;
      this.ready = Promise.resolve();
    }
    waitUntilReady() {
      return this.ready;
    }
    async addDelayed() {}
    async close() {}
    async close() {
      // nothing to clean up for compatibility scheduler
    }
  };

const redisEnabled = Boolean(process.env.REDIS_HOST || process.env.REDIS_URL);

const connection = redisEnabled
  ? process.env.REDIS_URL
    ? { url: process.env.REDIS_URL }
    : {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT || 6379),
        username: process.env.REDIS_USERNAME || undefined,
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_USE_TLS === 'true' ? {} : undefined,
      }
  : null;

module.exports = {
  Queue,
  Worker,
  QueueScheduler,
  QueueEvents,
  connection,
  redisEnabled,
};
