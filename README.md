# Fakturační Systém

Interní systém pro správu faktur, hardware a výkazů práce.

## 🏗️ Architektura
- **Backend:** Node.js (Express), Prisma ORM, PostgreSQL, Redis (BullMQ).
- **Frontend:** Next.js, Mantine UI.
- **Infrastruktura:** VM 108 (Ubuntu), PM2 Process Manager.
- **Storage:** Minio (S3 compatible) pro soubory.

## 🚀 CI/CD a Deployment
Projekt využívá plně automatizované nasazení pomocí **GitHub Actions** (Self-Hosted Runner na VM 108).

### Produkce (`main`)
- Jakýkoliv push do větve `main` automaticky spustí deploy.
- **Proces:** Checkout -> Backup DB -> Install -> Build -> Deploy -> Restart PM2.
- **URL:** http://192.168.250.108:3030

### Vývoj (`develop`)
- Slouží pro testování nových funkcí před sloučením do main.
- (V přípravě: Automatický deploy na dev server).

## 📦 Verzování a Release
Používáme **Sémantické Verzování** (SemVer) a **Conventional Commits**.

### Jak psát commity
Aby fungovalo automatické generování verzí, dodržujte formát:
- `feat: popis nové funkce` -> Zvýší verzi o 0.1.0 (Minor)
- `fix: popis opravy chyby` -> Zvýší verzi o 0.0.1 (Patch)
- `chore: údržba, refactoring` -> Nemění verzi
- `BREAKING CHANGE: popis` -> Zvýší verzi o 1.0.0 (Major)

### Jak vydat novou verzi
Když jsou změny otestované na `main`, spusťte release:

```bash
# 1. Ujistěte se, že máte aktuální main
git checkout main
git pull origin main

# 2. Vytvořit novou verzi (automaticky upraví package.json a CHANGELOG.md)
npm run release

# 3. Odeslat na GitHub (spustí deploy)
git push --follow-tags origin main
```

## 🛡️ Zálohování
- **Databáze:** Zálohuje se automaticky každý den ve 02:00 ráno.
- **Skript:** `/home/fakturace/scripts/backup_db.sh`
- **Umístění záloh:** `/home/fakturace/backups/postgres/`
- **Retence:** Uchovává se posledních 7 dní.

## 🛠️ Rychlé příkazy (Server)
```bash
# Stav aplikace
pm2 status

# Logy
pm2 logs

# Ruční restart
pm2 restart all
```
