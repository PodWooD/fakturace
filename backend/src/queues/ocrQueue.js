const { Queue, Worker, QueueScheduler, QueueEvents, connection, redisEnabled } = require('./connection');
const storageService = require('../services/storageService');
const { parseInvoice } = require('../services/ocrService');

let queue = null;
let queueEvents = null;
let readyPromise = null;
let eventsReadyPromise = null;

const OCR_MAX_ATTEMPTS = parseInt(process.env.OCR_MAX_ATTEMPTS || '3', 10);
const OCR_BACKOFF_MS = parseInt(process.env.OCR_RETRY_BACKOFF_MS || '5000', 10);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (redisEnabled && connection) {
  queue = new Queue('ocr:process', { connection });
  const scheduler = new QueueScheduler('ocr:process', { connection });
  readyPromise = scheduler.waitUntilReady();
  queueEvents = new QueueEvents('ocr:process', { connection });
  eventsReadyPromise = queueEvents.waitUntilReady();
  queueEvents.on('error', (error) => {
    console.error('[Queues] OCR queue events error:', error);
  });

  const worker = new Worker(
    'ocr:process',
    async (job) => {
      const { sourceLocation, filename, mimetype } = job.data;
      const buffer = await storageService.getFileBuffer(sourceLocation);
      if (!buffer) {
        throw new Error('Soubor pro OCR nebyl nalezen');
      }

      const payload = await parseInvoice({ buffer, filename, mimetype });

      if (payload?.__mock) {
        throw new Error(payload.errorMessage || 'OCR selhalo');
      }

      return payload;
    },
    { connection }
  );

  worker.on('failed', (job, err) => {
    console.error('[Queues] OCR job failed', job?.id, err?.message);
  });
  worker.on('error', (error) => {
    console.error('[Queues] OCR worker error:', error);
  });
}

async function processOcrJob(data) {
  if (!redisEnabled || !queue || !queueEvents) {
    let lastError = null;
    for (let attempt = 1; attempt <= OCR_MAX_ATTEMPTS; attempt += 1) {
      try {
        const buffer = await storageService.getFileBuffer(data.sourceLocation);
        if (!buffer) {
          throw new Error('Soubor pro OCR nebyl nalezen');
        }
        const payload = await parseInvoice({ buffer, filename: data.filename, mimetype: data.mimetype });
        if (payload?.__mock) {
          throw new Error(payload.errorMessage || 'OCR selhalo');
        }
        return payload;
      } catch (error) {
        lastError = error;
        if (attempt < OCR_MAX_ATTEMPTS) {
          const delay = OCR_BACKOFF_MS * Math.pow(2, attempt - 1);
          await wait(delay);
        }
      }
    }
    const message = lastError?.message || 'OCR selhalo';
    throw new Error(`${message} (after ${OCR_MAX_ATTEMPTS} attempts)`);
  }

  if (readyPromise) {
    await readyPromise;
  }

  const job = await queue.add('process', data, {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: OCR_MAX_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: OCR_BACKOFF_MS,
    },
  });

  if (eventsReadyPromise) {
    await eventsReadyPromise;
  }

  try {
    return await job.waitUntilFinished(queueEvents);
  } catch (error) {
    const message = error?.message || 'OCR job failed';
    throw new Error(`${message} (after ${job.attemptsMade} attempts)`);
  }
}

async function getOcrQueueStats() {
  if (!redisEnabled || !queue) {
    return { enabled: false };
  }

  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return {
    enabled: true,
    counts,
  };
}

module.exports = {
  processOcrJob,
  getOcrQueueStats,
};
