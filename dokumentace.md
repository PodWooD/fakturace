# Technická Dokumentace Serveru Fakturace

**Datum poslední revize:** 24. 11. 2025
**Server:** VM 108 (192.168.250.108)
**Uživatel:** `fakturace`

## 1. Adresářová Struktura
Aplikace je umístěna v `/opt/fakturace`.

```
/opt/fakturace/
├── backend/                # Node.js Backend
│   ├── .env                # Konfigurace a Secrets (neverzováno!)
│   ├── prisma/             # Databázové schéma
│   └── src/                # Zdrojový kód API
├── frontend/               # Next.js Frontend
│   ├── .next/              # Sestavená aplikace (Build artifact)
│   └── src/                # Zdrojový kód UI
├── .github/                # CI/CD Pipeline definice
└── package.json            # Hlavní skripty (release)
```

## 2. Infrastruktura a Služby

### PM2 (Process Manager)
Aplikace běží pod uživatelem `fakturace` a je spravována PM2.
- **ID 0:** `fakturace-backend` (API, Port 3029)
- **ID 1:** `fakturace-queues` (Worker pro PDF a e-maily)
- **ID 2:** `fakturace-frontend` (Next.js UI, Port 3030)

Spouštění po restartu serveru je zajištěno přes `pm2 startup`.

### GitHub Runner
Na serveru běží služba `actions.runner.PodWooD-fakturace.fakturace-prod-runner`.
- **Umístění:** `/home/fakturace/actions-runner`
- **Funkce:** Poslouchá změny na GitHubu a provádí deploy.
- **Pracovní adresář:** `_work/fakturace/fakturace` (zde probíhá build, výsledek se pak kopíruje do `/opt/fakturace`).

### Databáze a Redis
- **PostgreSQL 14:** Běží na portu 5432.
- **Redis 6:** Běží na portu 6379 (používá se pro BullMQ fronty).

## 3. Proces Nasazení (Deployment)
Deployment je plně automatizován souborem `.github/workflows/deploy.yml`.

**Kroky pipeline:**
1.  **Záloha:** Spustí se `backup_db.sh` pro jistotu.
2.  **Build:** Na runneru se stáhne kód, nainstalují závislosti a sestaví Next.js aplikace.
3.  **Sync:** Hotové soubory se pomocí `rsync` přenesou do `/opt/fakturace`.
    *   *Poznámka:* Soubory `.env` a složka `uploads/` jsou při synchronizaci vynechány, aby nedošlo ke ztrátě dat.
4.  **Restart:** Provede se `pm2 restart all`.

## 4. Řešení problémů (Troubleshooting)

### Aplikace neodpovídá
1.  Zkontrolujte stav procesů: `pm2 status`
2.  Podívejte se na chyby: `pm2 logs --lines 50 --err`

### Deployment selhal
1.  Jděte na GitHub -> Actions a podívejte se na log selhání.
2.  Pokud je chyba v runneru na serveru, logy jsou v `/home/fakturace/actions-runner/_diag/`.

### Obnova ze zálohy
Zálohy jsou v `/home/fakturace/backups/postgres/`.

**Postup obnovy:**
```bash
# 1. Rozbalit zálohu
gunzip -c /home/fakturace/backups/postgres/fakturace_db_YYYYMMDD.sql.gz > restore.sql

# 2. Obnovit do DB (POZOR: Přepíše data!)
psql -U fakturace_user -d fakturace_db -f restore.sql
```

## 5. Přístupy a Bezpečnost
- **SSH:** Přístup přes klíč (`/home/noreason/ssh_key`).
- **Secrets:** Uloženy v `/opt/fakturace/backend/.env`. Nikdy neposílat na GitHub!
- **Firewall:** UFW by měl povolovat porty 22, 3030 (Web), 3029 (API).
