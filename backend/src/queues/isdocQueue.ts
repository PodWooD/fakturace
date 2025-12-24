import { Queue, Worker, QueueEvents, QueueScheduler, connection, redisEnabled } from './connection';
import { IsdocExport } from '../services/isdocExport';
import { Invoice, Organization, WorkRecord, Service, Hardware } from '@prisma/client';
import { InvoiceTotals } from '../services/invoiceTotals';

// Assuming JobData structure based on usage
interface IsdocJobData {
    invoice: Invoice;
    organization: Organization;
    workRecords: WorkRecord[];
    services: Service[];
    hardware: Hardware[];
    totals: InvoiceTotals;
}

const isdocExport = new IsdocExport();
const QUEUE_NAME = 'invoice-isdoc';

let queue: Queue<IsdocJobData> | null = null;
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

    queueEvents.on('error', (error) => console.error('[Queues] ISDOC queue events error:', error));

    const worker = new Worker<IsdocJobData>(
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

export async function generateIsdoc(data: IsdocJobData) {
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

export async function getIsdocQueueStats() {
    if (!redisEnabled || !queue) return { enabled: false };
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    return { enabled: true, counts };
}
