const { env } = process;

const {
  NodeSDK,
} = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const {
  PeriodicExportingMetricReader,
} = require('@opentelemetry/sdk-metrics');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');

let sdkInstance = null;

const toBool = (value, defaultValue = true) => {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return ['1', 'true', 'on', 'yes'].includes(String(value).toLowerCase());
};

const buildTraceExporter = () => {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT || env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (!endpoint) {
    return null;
  }
  const headers = {};
  if (env.OTEL_EXPORTER_OTLP_HEADERS) {
    env.OTEL_EXPORTER_OTLP_HEADERS.split(',').forEach((pair) => {
      const [key, value] = pair.split('=').map((part) => part.trim());
      if (key && value) {
        headers[key] = value;
      }
    });
  }
  return new OTLPTraceExporter({ endpoint, headers });
};

const buildMetricReader = () => {
  const endpoint = env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    return null;
  }
  const exporter = new OTLPMetricExporter({ endpoint });
  return new PeriodicExportingMetricReader({ exporter });
};

const start = async () => {
  if (sdkInstance || !toBool(env.OTEL_ENABLED, true)) {
    return sdkInstance;
  }

  const traceExporter = buildTraceExporter();
  const metricReader = buildMetricReader();

  const instrumentations = getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-http': {
      ignoreIncomingRequestHook: (req) => {
        const sanitized = req.url || '';
        return sanitized.startsWith('/api/health') || sanitized.startsWith('/health');
      },
    },
    '@opentelemetry/instrumentation-express': {
      enabled: true,
    },
    '@opentelemetry/instrumentation-prisma': {
      enabled: true,
      responseHook: (span, response) => {
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
      [SemanticResourceAttributes.SERVICE_VERSION]: env.npm_package_version || '1.0.0',
    }),
    traceExporter: traceExporter || undefined,
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

module.exports = {
  start,
};
