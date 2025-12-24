import { Queue, Worker, QueueEvents, QueueScheduler, connection, redisEnabled } from './connection';
import { PDFGenerator } from '../services/pdfGenerator';
import { Invoice, Organization, WorkRecord, Service, Hardware } from '@prisma/client';

interface PdfJobData {
    invoice: Invoice;
    organization: Organization;
    workRecords: WorkRecord[];
    services: Service[];
    hardware: Hardware[];
}

const pdfGenerator = new PDFGenerator();
const QUEUE_NAME = 'invoice-pdf';

let queue: Queue<PdfJobData> | null = null;
let queueEvents: QueueEvents | null = null;
let readyPromise: Promise<any> | null = null;
let eventsReadyPromise: Promise<any> | null = null;
let scheduler: any = null;

if (redisEnabled && connection) {
    queue = new Queue(QUEUE_NAME, { connection });
    scheduler = new QueueScheduler(QUEUE_NAME, { connection });
    readyPromise = Promise.all([queue.waitUntilReady(), scheduler.waitUntilReady()]);
    queueEvents = new QueueEvents(QUEUE_NAME, { connection });
    eventsReadyPromise = queueEvents.waitUntilReady();

    queueEvents.on('error', (error) => console.error('[Queues] PDF queue events error:', error));

    const worker = new Worker<PdfJobData>(
        QUEUE_NAME,
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

export async function generateInvoicePdf(data: PdfJobData) {
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

export async function getPdfQueueStats() {
    if (!redisEnabled || !queue) return { enabled: false };
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    return { enabled: true, counts };
}
