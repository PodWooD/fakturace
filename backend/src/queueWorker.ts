#!/usr/bin/env node

/**
 * Dedicated worker entrypoint that boots all BullMQ queues without the HTTP server.
 * Keeps the process alive so background jobs (OCR, PDF, Pohoda, ISDOC, notifications)
 * are processed even když API není spuštěné.
 */

import 'dotenv/config';
import { start as startTelemetry } from './telemetry';
startTelemetry();

import { redisEnabled } from './queues/connection';

// Requiring jednotlivých modulů instancuje QueueScheduler + Worker při zapnutém Redis
import './queues/ocrQueue';
import './queues/pdfQueue';
import './queues/pohodaQueue';
import './queues/isdocQueue';
import './queues/notificationQueue';

const logPrefix = '[QueueWorker]';

if (!redisEnabled) {
    console.warn(`${logPrefix} Redis není nakonfigurovaný, worker běží v inline režimu.`);
} else {
    console.log(`${logPrefix} Redis připojen, BullMQ worker aktivní.`);
}

const shutdown = async (signal: string) => {
    console.log(`${logPrefix} Caught ${signal}, ukončuji...`);
    // BullMQ workers se zavřou automaticky po ukončení procesu;
    // drobné zpoždění nechá doběhnout probíhající joby.
    setTimeout(() => process.exit(0), 500);
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
