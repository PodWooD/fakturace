const {
  Queue,
  Worker,
  QueueScheduler,
  QueueEvents,
  connection,
  redisEnabled,
} = require('./connection');
const { PrismaClient } = require('@prisma/client');
const { createNotification } = require('../services/notificationService');

const queueName = 'notifications:dispatch';

let queue = null;
let queueEvents = null;
let readyPromise = null;
let eventsReadyPromise = null;

const prisma = new PrismaClient();

if (redisEnabled && connection) {
  queue = new Queue(queueName, { connection });
  const scheduler = new QueueScheduler(queueName, { connection });
  readyPromise = scheduler.waitUntilReady();
  queueEvents = new QueueEvents(queueName, { connection });
  eventsReadyPromise = queueEvents.waitUntilReady();
  queueEvents.on('error', (error) => {
    console.error('[Queues] Notification queue events error:', error);
  });

  const worker = new Worker(
    queueName,
    async (job) => {
      const payload = job.data;
      await createNotification(prisma, payload);
      return true;
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    console.error('[Queues] Notification job failed', job?.id, err?.message);
  });
  worker.on('error', (error) => {
    console.error('[Queues] Notification worker error:', error);
  });
}

const enqueueNotification = async (payload, prismaInstance = prisma) => {
  if (redisEnabled && queue && queueEvents) {
    if (readyPromise) {
      await readyPromise;
    }
    const job = await queue.add('notify', payload, {
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    if (eventsReadyPromise) {
      await eventsReadyPromise;
    }
    return job.id;
  }

  // Fallback: přímý zápis do DB
  await createNotification(prismaInstance, payload);
  return null;
};

const getNotificationQueueStats = async () => {
  if (!redisEnabled || !queue) {
    return { enabled: false };
  }
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return { enabled: true, counts };
};

module.exports = {
  enqueueNotification,
  getNotificationQueueStats,
};
