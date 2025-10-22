# Observabilita

Tento projekt používá OpenTelemetry a Prometheus‑kompatibilní metriky.

## OpenTelemetry

- `OTEL_ENABLED` zapne inicializaci SDK (výchozí `true`).
- Koncový bod OTLP lze nastavit proměnnou `OTEL_EXPORTER_OTLP_ENDPOINT` (např. `http://otel-collector:4318/v1/traces`).
- Záhlaví pro autentizaci lze doplnit přes `OTEL_EXPORTER_OTLP_HEADERS` (např. `x-api-key=secret-token`).
- Název služby je možné změnit pomocí `OTEL_SERVICE_NAME`.
- Automaticky se instrumentují HTTP/Express, Prisma a ioredis (BullMQ).

> Pokud není nastaven endpoint, telemetrie se inicializuje pouze lokálně a nic neexportuje.

## Prometheus metriky

- Endpoint `GET /metrics` vrací data ve formátu Prometheus.
- `PROM_METRIC_PREFIX` (výchozí `fakturace_`) je prefix metrik.
- `PROM_SERVICE_NAME` (výchozí `fakturace-backend`) se přidává jako výchozí label.
- Exponované metriky:
  - `*_queue_jobs{queue,state}` – počet úloh ve frontách BullMQ.
  - `*_queue_waiting_duration_ms{queue}` – odhad čekací doby, pokud je dostupná (zatím pouze placeholder).
  - systémové metriky z `prom-client.collectDefaultMetrics()`.

### Básní konfigurace Prometheusu

```yaml
scrape_configs:
  - job_name: 'fakturace-backend'
    metrics_path: /metrics
    static_configs:
      - targets: ['fakturace-backend:3029']
```

## Grafana dashboard

V adresáři `docs/observability/grafana-dashboard.json` je export dashboardu připravený pro import do Grafany. Panel obsahuje:

- přehled úloh ve frontách (stacked bar podle stavu),
- tabulku s posledními hodnotami metrik, včetně nápovědy pro alarmy.

Stačí dashboard importovat (Dashboards → Import → Upload JSON) a nastavit Prometheus data source.

## Troubleshooting

| Symptom | Likely Cause | Co zkontrolovat |
|---------|--------------|------------------|
| `/metrics` vrací chybu nebo je prázdné | Telemetrie není aktivní | Zkontroluj `OTEL_ENABLED`, `PROM_METRIC_PREFIX`, běh procesu backendu |
| Počet front (`ocr`, `pdf`, `pohoda`, `isdoc`, `notifications`) je `enabled: false` | Redis neběží nebo není správná konfigurace | Nastav `REDIS_HOST/PORT` nebo spusť `docker compose up redis`, ověř `/api/system/queues` |
| OCR selhání bez notifikace | Nespuštěná fronta notifications | Ověř Redis, logy queue workeru; fallback zapisuje notifikace přímo do DB |
| Import PDF/ISDOC končí na 500 | Chybějící MinIO konfigurace nebo chyba OCR | Zkontroluj `MINIO_*` proměnné, log OCR služby (Mistral) |
| `/api/import/excel` vrací 500 | Chybějící sloupce v Excelu nebo řádek s nevalidním datem | Projdi log backendu, test data v `tests/import.integration.test.js` |
| Generování faktur (PDF/ISDOC/Pohoda) padá | Fronty generátorů neběží nebo MinIO nedostupné | Ověř Redis + MinIO, logy `invoice:*` a uploadu |
| Telemetrie běží, ale Grafana nevidí data | Chybí scrape v Prometheu | Doplnit job `metrics_path: /metrics`, zajistit reachability hostitele |

Pokud problém přetrvává, podívej se do auditních logů (`/api/audit`) nebo spusti integrační testy (`npm test` v `backend/`), které pokrývají OCR, importy a generování faktur.
