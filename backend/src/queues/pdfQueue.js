const { Queue, Worker, QueueScheduler, QueueEvents, connection, redisEnabled } = require('./connection');
const PDFGenerator = require('../services/pdfGenerator');
const storageService = require('../services/storageService');

const pdfGenerator = new PDFGenerator();

let queue = null;
let queueEvents = null;
let readyPromise = null;
let eventsReadyPromise = null;

if (redisEnabled && connection) {
  queue = new Queue('invoice:pdf', { connection });
  const scheduler = new QueueScheduler('invoice:pdf', { connection });
  readyPromise = scheduler.waitUntilReady();
  queueEvents = new QueueEvents('invoice:pdf', { connection });
  eventsReadyPromise = queueEvents.waitUntilReady();
  queueEvents.on('error', (error) => console.error('[Queues] PDF queue events error:', error));

  const worker = new Worker(
    'invoice:pdf',
    async (job) => {
      const { invoice, organization, workRecords, services, hardware } = job.data;
      const stored = await pdfGenerator.saveInvoicePDF(
        invoice,
        workRecords,
        services,
        hardware,
        organization,
      );
      return stored.location;
    },
    { connection }
  );
  worker.on('failed', (job, err) => console.error('[Queues] PDF job failed', job?.id, err?.message));
  worker.on('error', (error) => console.error('[Queues] PDF worker error:', error));
}

async function generateInvoicePdf(data) {
  if (!redisEnabled || !queue || !queueEvents) {
    const stored = await pdfGenerator.saveInvoicePDF(
      data.invoice,
      data.workRecords,
      data.services,
      data.hardware,
      data.organization,
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

async function getPdfQueueStats() {
  if (!redisEnabled || !queue) return { enabled: false };
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return { enabled: true, counts };
}

module.exports = {
  generateInvoicePdf,
  getPdfQueueStats,
};
