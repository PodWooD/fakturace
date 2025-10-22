# Fakturace v1.0

Moderní platforma pro zpracování přijatých faktur, evidenci práce techniků a generování podkladů pro fakturaci. Implementace odpovídá specifikaci v `docs/fakturace_v1.0_en.md` a staví na otevřeném technologickém stacku.

## Architektura

- **Backend** – Node.js + Express + Prisma ORM nad PostgreSQL. Moduly pro organizace, výkazy, přijaté faktury (OCR, automatické rozsekání položek, slevy s `referenceProductCode`), hardware, fakturaci a auditní logy. Částky ukládáme v integer centech.
- **Frontend** – Next.js 14 (App Router), Mantine 7, TanStack Query. React komponenty pokrývají dashboard, organizace, výkazy, přijaté faktury (včetně náhledu originálu), hardware a billing nástroje.
- **Obsluha účtování** – Accounting lock API (zamykání období) a audit logger propisující změny do tabulky `AuditLog`.
- **Soubory** – Originální faktury, PDF a Pohoda XML jdou přes `storageService` do MinIO; pokud není nastaveno, použije se lokální `backend/uploads`.
- **Fronty** – BullMQ + Redis zpracovává OCR reprocessing, PDF a Pohoda exporty. Pokud Redis neběží, backend přepne do inline módu.

## Požadavky

- Node.js 18+
- NPM 9+
- PostgreSQL 15+ (lokálně lze použít Docker)

## Lokální spuštění

### Backend

```bash
cd backend
npm install
cp .env.example .env               # upravte DATABASE_URL / MinIO / Redis podle potřeby

npx prisma migrate deploy          # aplikuje schéma
npm run seed                       # vytvoří výchozí data (admin, organizace, ceníky)

npm run dev                        # http://localhost:3029 (Express + Prisma)

# volitelné: worker pro fronty (OCR, PDF, Pohoda) – vyžaduje běžící Redis
npm run worker
```

> TIP: `docker-compose.yml` v kořeni spustí PostgreSQL, Redis a MinIO (`docker compose up -d`). Přihlašovací údaje odpovídají hodnotám z `.env.example`.

#### Konfigurace úložiště (MinIO / S3)

Backend automaticky ukládá originální soubory faktur, PDF exporty a Pohoda XML přes MinIO klienta. Pro lokální vývoj stačí spustit MinIO z `docker-compose.yml` a doplnit do `.env` tyto hodnoty (viz `backend/.env.example`):

```
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=fakturace
MINIO_SECRET_KEY=fakturace123
MINIO_BUCKET=fakturace-files
MINIO_USE_SSL=false
```

Pokud necháte proměnné prázdné, systém spadne do fallback režimu a ukládá soubory do `backend/uploads`, takže není nutné MinIO zapojovat hned. Doporučený produkční provoz však spoléhá na objektové úložiště.

Po doplnění proměnných můžete existující soubory přesunout z lokálního adresáře do MinIO příkazem:

```bash
cd backend
npm run migrate:uploads
```

Skript je idempotentní – přeskočí položky, které už míří na `s3://…` a v případě nenastaveného MinIO pouze vypíše upozornění.

#### Redis fronty (BullMQ)

OCR a exporty běží přes BullMQ. Po spuštění backendu je k dispozici endpoint `GET /api/system/queues`, který vrací počty úloh ve frontách (OCR/PDF/Pohoda). V lokálním prostředí stačí spustit službu Redis z `docker-compose.yml` nebo použít vlastní instanci.

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local # upravte NEXT_PUBLIC_API_URL pokud backend běží na jiném hostiteli
npm run dev
```

Frontend je dostupný na `http://localhost:3030` a komunikuje s backendem na `http://localhost:3029`.

### Role & přístupy

Seed vytvoří uživatele `admin@fakturace.cz` / `admin123` (role `ADMIN`). JWT token nese roli (`ADMIN`, `ACCOUNTANT`, `TECHNICIAN`, `VIEWER`) a backend i frontend podle ní omezují akce – např. schválení faktury nebo re-OCR je dostupné jen ADMIN/ACCOUNTANT. Po přihlášení doporučujeme heslo změnit v sekci **Nastavení**.

## Legacy kód

Migrace z Next.js Pages Routeru je dokončená – legacy komponenty byly z repozitáře odstraněny. Potřebujete-li historickou verzi, použijte Git historii.

## Build & test

```bash
# frontend produkční build
cd frontend
npm run build

# backend testy (volitelné, aktualizujte podle potřeby)
cd ../backend
npm test
```

### Testy

#### Backend (`backend/`)

- Testy vyžadují běžící PostgreSQL a CLI utilitu `psql`. V případě potřeby nastav proměnnou `TEST_DATABASE_URL` (např. `postgresql://postgres:postgres@localhost:5432/postgres`).
- `npm test` spouští
  - unit testy (`tests/invoiceTotals.test.js`),
  - integrační testy (`tests/import.integration.test.js`, `tests/billing.integration.test.js`, `tests/workflow.integration.test.js`).
- `npm run prisma:migrate` – aplikuje DB migrace.

Frontend zatím nemá automatizované testy – TODO doplnit (unit/e2e).

## Další zdroje

- Specifikace: `docs/fakturace_v1.0_en.md`
- Popis nasazení & skriptů: `deploy-to-new-server.sh`, `start.sh`, `stop.sh`
- Audit & lock API: `backend/src/routes/accounting.js`, `backend/src/routes/audit.js`

Případné otázky či návrhy na vylepšení dokumentujte v issue trackeru projektu.
