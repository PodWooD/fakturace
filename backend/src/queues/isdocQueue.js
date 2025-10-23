const { Queue, Worker, QueueScheduler, QueueEvents, connection, redisEnabled } = require('./connection');
const IsdocExport = require('../services/isdocExport');
const storageService = require('../services/storageService');

const isdocExport = new IsdocExport();
const QUEUE_NAME = 'invoice-isdoc';

let queue = null;
let queueEvents = null;
let readyPromise = null;
let eventsReadyPromise = null;
let scheduler = null;

if (redisEnabled && connection) {
  queue = new Queue(QUEUE_NAME, { connection });
  scheduler = new QueueScheduler(QUEUE_NAME, { connection });
  readyPromise = Promise.all([queue.waitUntilReady(), scheduler.waitUntilReady()]);
  queueEvents = new QueueEvents(QUEUE_NAME, { connection });
  eventsReadyPromise = queueEvents.waitUntilReady();
  queueEvents.on('error', (error) => console.error('[Queues] ISDOC queue events error:', error));

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { invoice, organization, workRecords, services, hardware, totals } = job.data;
      const stored = await isdocExport.saveInvoiceISDOC(
        invoice,
        workRecords,
        services,
        hardware,
        organization,
        totals,
      );
      return stored.location;
    },
    { connection },
  );

  worker.on('failed', (job, err) => console.error('[Queues] ISDOC job failed', job?.id, err?.message));
  worker.on('error', (error) => console.error('[Queues] ISDOC worker error:', error));
}

async function generateIsdoc(data) {
  if (!redisEnabled || !queue || !queueEvents) {
    const stored = await isdocExport.saveInvoiceISDOC(
      data.invoice,
      data.workRecords,
      data.services,
      data.hardware,
      data.organization,
      data.totals,
    );
    return stored.location;
  }

  if (readyPromise) {
    await readyPromise;
  }

  const job = await queue.add('generate', data, {
    removeOnComplete: true,
    removeOnFail: false,
  });

  if (eventsReadyPromise) {
    await eventsReadyPromise;
  }

  return job.waitUntilFinished(queueEvents);
}

async function getIsdocQueueStats() {
  if (!redisEnabled || !queue) return { enabled: false };
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return { enabled: true, counts };
}

module.exports = {
  generateIsdoc,
  getIsdocQueueStats,
};
