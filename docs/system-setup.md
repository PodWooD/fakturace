# Instalace a nastavení systému Fakturace (stav Q4 2025)

Tento dokument popisuje kompletní postup instalace, konfigurace a spuštění celého systému ve stavu, který odpovídá aktuální větvi `main` v lokálním repozitáři. Navazuje na existující dokumentaci v `README.md` a `docs/installation-guide.md`, ale zaměřuje se na praktické kroky a konfigurační detaily, které reflektují nejnovější změny (BullMQ kompatibilita, lokální OCR fallback, MinIO/Redis/observability).

---

## 1. Architektura a komponenty

- **Backend (`backend/`)** – Node.js 18, Express, Prisma ORM, BullMQ fronty, služby pro OCR, PDF, ISDOC, Pohoda XML a notifikace. Při absenci Redisu a dalších služeb přepíná do inline režimu.
- **Frontend (`frontend/`)** – Next.js 14 (App Router), Mantine 7, TanStack Query. Komunikuje přes REST API na `/api`.
- **Databáze** – PostgreSQL 16 (viz `docker-compose.yml`). Prisma migrace a semena (`npm run seed`).
- **Úložiště souborů** – MinIO/S3 přes `storageService`; pokud není nastaveno, používá `backend/uploads`.
- **OCR** – Mistral OCR API (`MISTRAL_*` proměnné). Nově podporuje lokální fallback pro PDF pomocí balíčku `pdf-parse`.
- **Fronty** – BullMQ nad Redisem; queue worker se spouští samostatně (`npm run worker`). Scheduler kompatibilní i při absenci plné implementace.

---

## 2. Systémové požadavky

| Komponenta | Minimum | Poznámka |
|------------|---------|---------|
| OS | Linux/macOS/WSL2 | Produkci doporučujeme Ubuntu 22.04 LTS |
| Node.js | 18.18+ | Používá se v `backend/` i `frontend/` |
| npm | 9+ | Součást Node LTS |
| PostgreSQL | 15+ (lokálně 16 přes Docker) | Port 5433 je mapován na localhost |
| Redis | 6+ | Vyžadují jej BullMQ fronty (OCR/PDF/Pohoda/ISDOC/notifikace) |
| MinIO / S3 | Volitelné | Pro produkci doporučeno |
| Mistral OCR API | Volitelné, ale doporučeno | Bez klíče se použije lokální fallback jen pro PDF |

> Pro lokální vývoj stačí `docker compose up -d`, které spustí PostgreSQL, Redis, MinIO a pgAdmin.

---

## 3. Rychlý start (development)

```bash
git clone https://github.com/PodWooD/fakturace.git
cd fakturace

# infrastrukturní služby
docker compose up -d

# backend
cd backend
npm install
cp .env.example .env
npx prisma migrate deploy
npm run seed
npm run dev          # http://localhost:3029

# volitelně worker (OCR/PDF/ISDOC/Pohoda, běžící Redis)
npm run worker

# frontend v novém terminálu
cd ../frontend
npm install
cp .env.local.example .env.local
npm run dev          # http://localhost:3030
```

---

## 4. Konfigurace prostředí

### 4.1 Backend (`backend/.env`)

Klíčové proměnné:

```env
# Databáze
DATABASE_URL="postgresql://fakturace:fakturace@localhost:5433/fakturace?schema=public"

# Server
PORT=3029
NODE_ENV=development
CORS_ORIGIN=http://localhost:3030,http://127.0.0.1:3030
JWT_SECRET=change-me

# OCR (Mistral)
MISTRAL_OCR_API_KEY=sk-...
MISTRAL_OCR_URL=https://api.mistral.ai/v1/ocr
MISTRAL_FILES_URL=https://api.mistral.ai/v1/files
MISTRAL_OCR_MODEL=mistral-ocr-latest
MISTRAL_OCR_LANGUAGE=cs

# BullMQ / Redis
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=...

# MinIO / S3
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=fakturace
MINIO_SECRET_KEY=fakturace123
MINIO_BUCKET=fakturace-files
MINIO_USE_SSL=false

# Observability (OpenTelemetry + Prometheus)
OTEL_ENABLED=true
OTEL_SERVICE_NAME=fakturace-backend
PROM_SERVICE_NAME=fakturace-backend
```

- **OCR fallback**: Pokud `MISTRAL_OCR_API_KEY` chybí nebo volání selže, `ocrService` se pokusí PDF rozparsovat lokálně přes `pdf-parse`. To funguje jen pro PDF soubory, ostatní formáty stále vyžadují API.
- **BullMQ**: Nový `queues/connection.js` zajišťuje kompatibilitu i když není dostupný `QueueScheduler` (např. starší verze BullMQ). Bez Redis serveru poběží služby inline (blokující), takže se úlohy provedou okamžitě.
- **Úložiště**: Pokud nejsou proměnné `MINIO_*` nastaveny, soubory jdou do `backend/uploads`. Po přepnutí na MinIO lze migrovat skriptem `npm run migrate:uploads`.

### 4.2 Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3029
# NEXT_PUBLIC_APP_URL=http://localhost:3030
```

- `NEXT_PUBLIC_API_URL` ukazuje na base URL backendu (bez `/api` – klient sám přidává prefix).
- Pokud frontend běží za reverzní proxy s jinou URL, nastavte `NEXT_PUBLIC_APP_URL` pro generování odkazů v e-mailu / notifikacích.

---

## 5. Databáze, migrace a seed

1. `npx prisma migrate deploy` – aplikuje veškeré migrace na databázi definovanou v `DATABASE_URL`.
2. `npm run seed` – vytvoří výchozího administrátora `admin@fakturace.cz / admin123`, základní organizaci, ceníky, práva.
3. `npx prisma studio` – volitelně otevře GUI pro ověření dat.

> PostgreSQL instance v `docker-compose.yml` poslouchá na portu `5433`. V případě vlastní instalace nezapomeňte aktualizovat `DATABASE_URL`.

---

## 6. Spouštění služeb

| Úkol | Příkaz | Poznámky |
|------|--------|----------|
| Backend dev server | `npm run dev` | Express + Vite reload, port 3029 |
| Backend prod start | `npm run start` | Respektuje `PORT`, loguje přes Winston |
| BullMQ worker | `npm run worker` | Zpracuje OCR, PDF, Pohoda, ISDOC, notifikace |
| Frontend dev | `npm run dev` (ve `frontend/`) | Next.js dev server na portu 3030 |
| Frontend build | `npm run build && npm start` | Produkční režim |
| Docker infrastruktura | `docker compose up -d` | Postgres, Redis, MinIO, pgAdmin |

- `ecosystem.config.js` obsahuje definice pro PM2 (`api`, `frontend`, `queues`). Produkční server lze spustit: `pm2 start ecosystem.config.js && pm2 save`.
- Skripty `start.sh` / `stop.sh` obalují PM2 příkazy pro jednodušší správu na serveru.

---

## 7. OCR a práce se soubory

1. **Upload** – faktury se uploadují přes backend na MinIO/S3 (nebo lokální `uploads`).
2. **OCR pipeline** – `ocrService.parseInvoice()` nejprve zkusí Mistral API (upload souboru → získání signed URL → OCR request). Úspěch vede k normalizovanému payloadu (položky, částky, reference kód).
3. **Lokální fallback** – pokud Mistral není dostupný, modul se pokusí extrahovat základní metadata z PDF textové vrstvy (název dodavatele, číslo faktury, datum, sumy). K tomu je nutný balíček `pdf-parse`, který se nyní instaluje přes `backend/package.json`.
4. **Soubory** – generované PDF/ISDOC/Pohoda exporty se ukládají do stejného úložiště prostř. `storageService`. Bez MinIO se vše ukládá do `backend/uploads`.

---

## 8. Testování a kontrola kvality

### 8.1 Backend

```bash
cd backend
npm test
```

- Nově přibyl `src/services/ocrService.test.js`, který používá `node:test` a ověřuje:
  1. kompletní Mistral flow (upload → signed URL → OCR),
  2. zachycení chyb z Mistralu,
  3. parsování markdown-only odpovědí,
  4. lokální PDF fallback bez API klíče.
- Testy vyžadují Node 18+ a nepotřebují reálné připojení k Mistralu (fetch je mockován).

### 8.2 Frontend

```bash
cd frontend
npm run lint          # pokud je nastaveno v package.json
npm run test          # pokud doplníte testy (momentálně TODO)
```

### 8.3 End-to-end

- V kořeni jsou Playwright skripty (`test-fakturace-playwright.spec.js`, `test-complete-system.js`). Spouštění:
  ```bash
  npm install     # v kořeni, pro playwright dev závislosti
  npx playwright test --config=playwright.config.js
  ```
- Testy očekávají běžící backend + frontend a výchozí přihlašovací údaje.

---

## 9. Produkční nasazení

1. **Buildy**
   ```bash
   cd frontend && npm run build
   cd ../backend && npm run build # pokud zavedete build script, jinak npm run start
   ```
2. **PM2** – `pm2 start ecosystem.config.js && pm2 save`.
3. **Reverse proxy** – použijte `nginx.conf` v kořeni jako výchozí šablonu (HTTP → frontend, `/api` → backend).
4. **SSL** – doporučen Let's Encrypt (`certbot --nginx`).
5. **Monitoring** – povolte OpenTelemetry export (`OTEL_EXPORTER_OTLP_ENDPOINT`) nebo Prometheus (endpoint `/metrics` přes `prom-client`).
6. **Zálohy** – skript `scripts/backup.sh` (vzor v dokumentaci) pravidelně zálohuje DB a konfigurační soubory. Naplánujte přes `cron`.

---

## 10. Troubleshooting

| Problém | Možná příčina | Řešení |
|---------|---------------|--------|
| `OCR selhalo` i s PDF | Chybí API klíč a PDF nemá textovou vrstvu | Zkuste Mistral API nebo nahrajte PDF s textem |
| Fronty se nikdy nespustí | Redis neběží / nepřístupný | Zkontrolujte `docker compose ps`, logy `redis` služby, případně aktualizujte `REDIS_*` |
| Upload padá na MinIO | Nesprávné přihlašovací údaje / bucket | Ověřte `MINIO_*`, případně spusťte `npm run migrate:uploads` po změně |
| `npm test` selhává na fetch | Starší verze Node (<18) | Ujistěte se, že používáte Node 18+ s globálním `fetch` |
| Frontend nedostupný přes nginx | Chybí proxy pro WebSockety | Přidejte `proxy_set_header Upgrade` a `Connection 'upgrade'` (viz `nginx.conf`) |

---

## 11. Další zdroje

- `README.md` – rychlý přehled architektury a příkazů.
- `docs/installation-guide.md` – rozšířená příručka se systémovými požadavky, Nginx, PM2, backupy.
- `docs/user-guide.md` – popis uživatelského rozhraní a workflow.
- `docs/api-documentation.md` – detailní popis REST API.
- `visual-documentation.md` – screenshoty obrazovek.

---

_Aktualizováno: commit `1fb0c99` (lokální větev `main`)._
