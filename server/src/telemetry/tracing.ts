import { register } from 'node:module';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

/**
 * OpenTelemetry tracing for the SecSim server. Loaded by bootstrap.ts only
 * when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and before app.js is imported,
 * so the ESM loader hook below can patch `http` and `express`. Spans are
 * exported over OTLP/HTTP to that endpoint (the platform OTel collector);
 * the exporter reads the standard `OTEL_*` variables itself.
 */
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'secsim-server',
  }),
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [
    new HttpInstrumentation({
      // Health checks and scrapes would drown out real traffic.
      ignoreIncomingRequestHook: (req) =>
        req.url === '/api/health' || req.url?.startsWith('/metrics') === true,
    }),
    new ExpressInstrumentation(),
  ],
});

sdk.start();
console.info(`OpenTelemetry tracing enabled → ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`);

const shutdown = (): void => {
  sdk.shutdown().catch((error) => console.warn('OpenTelemetry shutdown failed:', error));
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
