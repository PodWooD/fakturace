const { env } = process;

import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

let sdkInstance: NodeSDK | null = null;

const toBool = (value: any, defaultValue = true): boolean => {
    if (value === undefined) {
        return defaultValue;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    return ['1', 'true', 'on', 'yes'].includes(String(value).toLowerCase());
};

const buildTraceExporter = () => {
    const url = env.OTEL_EXPORTER_OTLP_ENDPOINT || env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    if (!url) {
        return undefined;
    }
    const headers: Record<string, string> = {};
    if (env.OTEL_EXPORTER_OTLP_HEADERS) {
        env.OTEL_EXPORTER_OTLP_HEADERS.split(',').forEach((pair) => {
            const [key, value] = pair.split('=').map((part) => part.trim());
            if (key && value) {
                headers[key] = value;
            }
        });
    }
    return new OTLPTraceExporter({ url, headers });
};

const buildMetricReader = () => {
    const url = env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (!url) {
        return undefined;
    }
    const exporter = new OTLPMetricExporter({ url });

    // @ts-ignore - mismatch version workaround
    return new PeriodicExportingMetricReader({ exporter });
};

export const start = async () => {
    if (sdkInstance || !toBool(env.OTEL_ENABLED, true)) {
        return sdkInstance;
    }

    const traceExporter = buildTraceExporter();
    const metricReader = buildMetricReader();

    const instrumentations = getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
            // @ts-ignore
            ignoreIncomingRequestHook: (req) => {
                const sanitized = req.url || '';
                return sanitized.startsWith('/api/health') || sanitized.startsWith('/health');
            },
        },
        '@opentelemetry/instrumentation-express': {
            enabled: true,
        },
        // @ts-ignore
        '@opentelemetry/instrumentation-prisma': {
            enabled: true,
            responseHook: (span: any, response: any) => {
                if (span && response?.duration) {
                    span.setAttribute('prisma.duration', response.duration);
                }
            },
        },
        '@opentelemetry/instrumentation-ioredis': {
            enabled: true,
        },
    });

    sdkInstance = new NodeSDK({
        resource: new Resource({
            [SemanticResourceAttributes.SERVICE_NAME]: env.OTEL_SERVICE_NAME || 'fakturace-backend',
            // @ts-ignore
            [SemanticResourceAttributes.SERVICE_VERSION]: env.npm_package_version || '1.0.0',
        }),
        traceExporter: traceExporter || undefined,
        // @ts-ignore
        metricReader: metricReader || undefined,
        instrumentations,
    });

    try {
        await sdkInstance.start();
        console.log('[Telemetry] OpenTelemetry SDK initialized');
    } catch (error) {
        console.error('[Telemetry] Failed to initialize OpenTelemetry SDK:', error);
    }

    const shutdown = async () => {
        if (!sdkInstance) {
            return;
        }
        try {
            await sdkInstance.shutdown();
            console.log('[Telemetry] OpenTelemetry SDK shut down');
        } catch (error) {
            console.error('[Telemetry] Failed to shut down OpenTelemetry SDK:', error);
        }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    return sdkInstance;
};
