# Upgrade Notes – Fakturace v1.0

## Backend

- **Prisma schema** přepsána na PostgreSQL s integer cenami, novými enumy a entitami (AccountingPeriod, AuditLog).
- **API** doplněna o auditní logy, uzamykání období, přepracované endpoints pro faktury, pracovní záznamy, hardware a přijaté faktury, včetně ACL ochrany (ADMIN/ACCOUNTANT/TECHNICIAN/VIEWER).
- **Utility**: přidány helpery pro přepočet peněz (`src/utils/money.ts`) a kontrolu uzamčených období (`src/utils/accounting.ts`).
- **Audit**: většina mutačních operací zapisuje auditní záznamy (`services/auditLogger.ts`).
- **Soubory**: artefakty se ukládají přes `storageService` do MinIO, fallback na lokální FS. Přidán migrační skript `npm run migrate:uploads`.
- **Fronty**: OCR/PDF/Pohoda export využívají BullMQ + Redis (`/api/system/queues` pro monitoring), s fallbackem na inline zpracování pokud Redis není aktivní.
- **Role/ACL**: middleware `auth` nyní poskytuje `authorize(permission)`; frontend respektuje stejná oprávnění.

## Frontend

- Migrace na **Next.js App Router** s Mantine v7, React Query a RHF.
- Nové stránky: dashboard, organizace, pracovní záznamy, přijaté faktury, faktury, billing a nastavení.
- Legacy Pages a komponenty přesunuty do `frontend/legacy` (nejsou buildovány).
- Role uložená v JWT ovlivňuje navigaci i dostupné akce (import, reprocess OCR, exporty atd.).

## DevOps & konfigurace

- `DATABASE_URL` aktualizováno na PostgreSQL, `.env.example` doplněno o MinIO a Redis konfiguraci.
- README popisuje MinIO/Redis nastavení, skript `npm run migrate:uploads` a role/opránění.
- PostCSS / Tailwind konfigurace označena jako `*.legacy` – Mantine používá vlastní styly.

## Co ještě zbývá

- Přidat testy pro nové API (integration/unit) a queue scénáře.
- Doplniť observabilitu (OpenTelemetry + Prometheus/Grafana) a případné notifikace.
- Odstranit legacy kód po validaci všech funkcí.
