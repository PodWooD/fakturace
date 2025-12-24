import { Queue, Worker, QueueEvents, ConnectionOptions } from 'bullmq';
import * as bullmqFn from 'bullmq';

// QueueScheduler was removed in BullMQ 5.x+, but we keep the shim for compatibility if needed or simply re-export null/mock if not present.
// However, typically in modern BullMQ, we just don't need it.
// Let's keep the compat class similar to the original JS if we want to be safe, 
// or just omit it if we know we are on a new version.
// Given the original had a fallback `bullmq.QueueScheduler || class ...`, it suggests it might be running on a version where it's missing.
// We will replicate the behavior.

// @ts-ignore - QueueScheduler might not exist in the types if using new BullMQ
const SchedulerClass = (bullmqFn as any).QueueScheduler || class QueueSchedulerCompat {
    name: string;
    opts: any;
    ready: Promise<void>;

    constructor(name: string, opts = {}) {
        this.name = name;
        this.opts = opts;
        this.ready = Promise.resolve();
    }
    waitUntilReady() {
        return this.ready;
    }
    async addDelayed() { }
    async close() { }
};

const redisEnabled = Boolean(process.env.REDIS_HOST || process.env.REDIS_URL);

let connection: ConnectionOptions | undefined | null = null;

if (redisEnabled) {
    if (process.env.REDIS_URL) {
        // Parse URL or pass as is if compatible, BullMQ accepts ioredis options
        // Usually simpler to parse it or let ioredis handle it.
        // ConnectionOptions in BullMQ extends IORedis.RedisOptions
        connection = {
            // @ts-ignore - 'url' property might not be directly on ConnectionOptions but IORedis handles it via constructor usually. 
            // However, BullMQ connection object is passed to IORedis.
            // A safer way for partial migration is keeping the structure.
            url: process.env.REDIS_URL
        } as any;
    } else {
        connection = {
            host: process.env.REDIS_HOST || '127.0.0.1',
            port: Number(process.env.REDIS_PORT || 6379),
            username: process.env.REDIS_USERNAME || undefined,
            password: process.env.REDIS_PASSWORD || undefined,
            tls: process.env.REDIS_USE_TLS === 'true' ? {} : undefined,
        };
    }
}

export {
    Queue,
    Worker,
    QueueEvents,
    SchedulerClass as QueueScheduler,
    connection,
    redisEnabled
};
