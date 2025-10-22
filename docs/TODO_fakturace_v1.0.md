# ✅ Fakturace v1.0 – Implementation Checklist

> Living document that mirrors the scope from `docs/fakturace_v1.0_en.md`. Update after each milestone so we keep track of what is done and what remains.

### Codex follow-up tasks (2025-10-22)
- [x] Zabezpečit backend import a services routy přes `authorize(...)`.
- [x] Dokončit migraci souborů odstraněním veřejné cesty `/uploads`.
- [x] Přidat samostatný spouštěč BullMQ workerů (`npm run worker`).
- [x] Odstranit Next.js legacy Pages Router a staré build artefakty.
- [x] Dodat frontend unit/E2E testy a opravit spadlé běhy (Playwright, Puppeteer).

## Infra & Platform
- [ ] **MinIO storage integration**
  - [x] Add S3/MinIO client layer (env: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_USE_SSL`).
  - [x] Replace local `uploads/` writes (received invoices, PDF generator, Pohoda export, exports) with MinIO object storage.
  - [x] Persist storage locations in DB and expose download endpoints (no `/uploads` static serving).
  - [x] Migration/utility to copy existing local files into MinIO and update paths (`npm run migrate:uploads`).
- [ ] **Async processing (BullMQ + Redis)**
  - [x] Provision Redis config + docker-compose service.
  - [x] Wrap OCR + heavy exports into BullMQ jobs with retry/backoff (inline fallback if Redis disabled).
  - [x] Health/metrics for queues (REST endpoint `/api/system/queues`).
- [x] **Observability stack**
  - [x] Add OpenTelemetry instrumentation (HTTP, Prisma, queues).
  - [x] Expose metrics endpoint and wire Prometheus scrape config.
  - [x] Provide Grafana dashboard starter.

## Application Logic
- [ ] **Role-based access control**
  - [x] Define permissions per role (ADMIN/ACCOUNTANT/TECHNICIAN/VIEWER) in backend middleware.
  - [x] Enforce on sensitive routes (billing, exports, locks, audit, OCR retry).
  - [x] Adjust frontend navigation/actions to respect ACL for main modules (received invoices, invoices, work records, hardware, billing).
- [ ] **OCR lifecycle enhancements**
  - [x] Store original file references in MinIO for all uploads.
  - [x] Implement graceful retry strategy + user notifications for failed OCR.
  - [x] Surface OCR status badges in dashboard widgets.
- [x] **Hardware/service workflows**
  - [x] Ensure hardware split & assignment endpoints match specification (`POST /api/hardware/split`, `POST /api/hardware/assign`).
  - [x] Add missing frontend operations if any.

## Quality & Tooling
- [ ] **CI/CD pipeline**
  - [ ] GitHub Actions: lint, tests (unit + integration), build, prisma migrate.
  - [ ] Artifacts / preview deploy (optional).
- [ ] **Test suite**
  - [ ] Stabilize integration tests (seed DB, avoid `prisma db push` failures in CI).
  - [ ] Cover OCR happy-path with mocked Mistral responses.
  - [ ] Add storage service tests (MinIO mock).
- [ ] **Documentation update**
  - [x] Describe new env variables and deployment steps (MinIO, Redis, telemetry).
  - [x] Update README quickstart to replace local uploads with MinIO usage.
  - [x] Add troubleshooting for OCR/queues/storage.

## Stretch / Post-v1.0
- [x] ISDOC parsing pipeline (if required by roadmap).
- [ ] Notifications (email/Slack) on failed imports or locks.
- [ ] Frontend E2E coverage (Playwright) for main workflows.

_Last updated: 2025-10-19_
