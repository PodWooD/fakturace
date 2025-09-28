# Fakturace System - Changelog 2025-08-03

## Nové funkce

### 1. Podpora pole "Zakázka" pro rozdělení fakturace
- Přidána databázová pole `projectCode` a `billingOrgId` do tabulky WorkRecord
- Import nyní správně načítá pole "Zakázka" z Excel souboru
- Fakturace se nyní rozděluje podle organizace uvedené v poli "Zakázka"
- Vytvořena migrace: `add_project_billing_fields`

### 2. Měsíční rozdělení dat a přepínání
- Import automaticky extrahuje měsíc a rok z datumu každého záznamu
- Nový API endpoint `/api/work-records/available-months` pro získání dostupných měsíců
- Dashboard nyní umožňuje přepínání mezi jednotlivými měsíci
- Statistiky a souhrny se dynamicky aktualizují podle vybraného měsíce

### 3. Vylepšený import Excel souborů
- Upravena logika pro správné mapování sloupců různých verzí Excel souborů
- Podpora nových názvů sloupců:
  - "Společnost-pobočka" (místo "Organizace")
  - "Počet hodin" (místo "Hodiny")
  - "Výjezd (km)" (místo "Km")
- Rozšířeno mapování organizací o nové kódy (O01-O35, OBER, OHBR, atd.)

## Opravy chyb

### 1. Import Excel nenačítal žádné záznamy
- **Problém**: Import hlásil "0 záznamů" kvůli jiné struktuře sloupců
- **Řešení**: Upravena logika čtení sloupců s podporou různých názvů

### 2. Frontend port konflikt
- **Změna**: Frontend port změněn z 3000 na 3030
- **Aktualizováno**: CORS konfigurace v backend .env

## Technické změny

### Backend
- `/backend/prisma/schema.prisma` - přidány nové relace pro billingOrg
- `/backend/src/routes/import.js` - kompletně přepracován pro novou strukturu
- `/backend/src/routes/workRecords.js` - přidán endpoint pro dostupné měsíce
- `/backend/src/routes/invoices.js` - změněno seskupování podle billingOrgId

### Frontend
- `/frontend/src/pages/dashboard.tsx` - kompletně přepsán s podporou měsíců

### Database
- Nová pole v tabulce WorkRecord:
  - `projectCode` (String) - kód zakázky
  - `billingOrgId` (Int) - ID organizace pro fakturaci
- Nové indexy pro lepší výkon

## Instalační kroky pro existující systémy

1. Spustit databázovou migraci:
   ```bash
   cd backend
   npx prisma migrate deploy
   ```

2. Restartovat PM2 procesy:
   ```bash
   pm2 restart fakturace-backend fakturace-frontend
   ```

3. Aktualizovat mapování organizací v `/backend/src/routes/import.js` podle vašich potřeb

## Známé problémy
- Memory server API endpoint nefunguje správně
- Stav faktur v dashboardu zatím není propojený s reálnými fakturami