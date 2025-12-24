import { Queue, Worker, QueueEvents, QueueScheduler, connection, redisEnabled } from './connection';
import * as storageService from '../services/storageService';
import { parseInvoice } from '../services/ocrService';
import { OcrResult } from '../services/ocrService';

interface OcrJobData {
    sourceLocation: string;
    filename?: string;
    mimetype?: string;
    userEmail?: string; // Optional metadata
}

const OCR_MAX_ATTEMPTS = parseInt(process.env.OCR_MAX_ATTEMPTS || '3', 10);
const OCR_BACKOFF_MS = parseInt(process.env.OCR_RETRY_BACKOFF_MS || '5000', 10);
const QUEUE_NAME = 'ocr-process';

let queue: Queue<OcrJobData> | null = null;
let queueEvents: QueueEvents | null = null;
let readyPromise: Promise<any> | null = null;
let eventsReadyPromise: Promise<any> | null = null;
let scheduler: any = null;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

if (redisEnabled && connection) {
    queue = new Queue(QUEUE_NAME, { connection });
    scheduler = new QueueScheduler(QUEUE_NAME, { connection });
    readyPromise = Promise.all([queue.waitUntilReady(), scheduler.waitUntilReady()]);
    queueEvents = new QueueEvents(QUEUE_NAME, { connection });
    eventsReadyPromise = queueEvents.waitUntilReady();

    queueEvents.on('error', (error) => {
        console.error('[Queues] OCR queue events error:', error);
    });

    const worker = new Worker<OcrJobData, OcrResult>(
        QUEUE_NAME,
        async (job) => {
            const { sourceLocation, filename, mimetype } = job.data;
            const buffer = await storageService.getFileBuffer(sourceLocation);
            if (!buffer) {
                throw new Error('Soubor pro OCR nebyl nalezen');
            }

            // @ts-ignore - buffer type mismatch workaround if needed, but storageService returns Buffer | null
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

export async function processOcrJob(data: OcrJobData): Promise<OcrResult> {
    if (!redisEnabled || !queue || !queueEvents) {
        let lastError: any = null;
        for (let attempt = 1; attempt <= OCR_MAX_ATTEMPTS; attempt += 1) {
            try {
                const buffer = await storageService.getFileBuffer(data.sourceLocation);
                if (!buffer) {
                    throw new Error('Soubor pro OCR nebyl nalezen');
                }
                // @ts-ignore
                const payload = await parseInvoice({ buffer, filename: data.filename, mimetype: data.mimetype });
                if (payload?.__mock) {
                    throw new Error(payload.errorMessage || 'OCR selhalo');
                }
                return payload;
            } catch (error: any) {
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
    } catch (error: any) {
        const message = error?.message || 'OCR job failed';
        throw new Error(`${message} (after ${job.attemptsMade} attempts)`);
    }
}

export async function getOcrQueueStats() {
    if (!redisEnabled || !queue) {
        return { enabled: false };
    }

    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    return {
        enabled: true,
        counts,
    };
}
