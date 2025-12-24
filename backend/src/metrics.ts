import client, { Gauge, Registry } from 'prom-client';

const METRIC_PREFIX = process.env.PROM_METRIC_PREFIX || 'fakturace_';

export const register = new client.Registry();
register.setDefaultLabels({ service: process.env.PROM_SERVICE_NAME || 'fakturace-backend' });

client.collectDefaultMetrics({ register, prefix: METRIC_PREFIX });

const queueGauge = new client.Gauge({
    name: `${METRIC_PREFIX}queue_jobs`,
    help: 'Počet úloh ve frontách podle stavu',
    labelNames: ['queue', 'state'],
    registers: [register],
});

const queueLatencyGauge = new client.Gauge({
    name: `${METRIC_PREFIX}queue_waiting_duration_ms`,
    help: 'Odhad doby čekání na zpracování ve frontě (pokud dostupné)',
    labelNames: ['queue'],
    registers: [register],
});

interface QueueStats {
    enabled?: boolean;
    counts?: Record<string, number>;
    waitingDuration?: number;
}

interface MetricDescriptor {
    name: string;
    getter: () => Promise<QueueStats>;
}

export const updateQueueMetrics = async (descriptors: MetricDescriptor[] = []) => {
    queueGauge.reset();
    queueLatencyGauge.reset();

    await Promise.all(
        descriptors.map(async ({ name, getter }) => {
            try {
                const stats = await getter();
                if (!stats?.enabled || !stats?.counts) {
                    return;
                }
                Object.entries(stats.counts).forEach(([state, value]) => {
                    queueGauge.labels(name, state).set(value);
                });
                if (typeof stats.waitingDuration === 'number') {
                    queueLatencyGauge.labels(name).set(stats.waitingDuration);
                }
            } catch (error: any) {
                console.error(`[Metrics] Failed updating queue stats for ${name}:`, error.message);
            }
        }),
    );
};
