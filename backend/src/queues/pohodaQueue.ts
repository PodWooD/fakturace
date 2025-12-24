import { Queue, Worker, QueueEvents, QueueScheduler, connection, redisEnabled } from './connection';
import PohodaExport, { MappedInvoice, MappedOrganization, MappedService, MappedHardware, WorkRecord } from '../services/pohodaExport';

interface PohodaJobData {
    invoice: MappedInvoice;
    organization: MappedOrganization;
    workRecords: WorkRecord[];
    services: MappedService[];
    hardware: MappedHardware[];
}

const pohodaExport = new PohodaExport();
const QUEUE_NAME = 'invoice-pohoda';

let queue: Queue<PohodaJobData> | null = null;
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
    queueEvents.on('error', (error) => console.error('[Queues] Pohoda queue events error:', error));

    const worker = new Worker<PohodaJobData>(
        QUEUE_NAME,
        async (job) => {
            const { invoice, organization, workRecords, services, hardware } = job.data;
            const stored = await pohodaExport.savePohodaXML(
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
    worker.on('failed', (job, err) => console.error('[Queues] Pohoda job failed', job?.id, err?.message));
    worker.on('error', (error) => console.error('[Queues] Pohoda worker error:', error));
}

export async function generatePohodaXml(data: PohodaJobData) {
    if (!redisEnabled || !queue || !queueEvents) {
        const stored = await pohodaExport.savePohodaXML(
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

export async function getPohodaQueueStats() {
    if (!redisEnabled || !queue) return { enabled: false };
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    return { enabled: true, counts };
}
