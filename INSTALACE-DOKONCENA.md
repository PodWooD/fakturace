# Instalace Fakturace System - Dokončeno ✅

## Stav instalace
Instalace byla úspěšně dokončena. Všechny komponenty jsou připraveny k použití.

## Co bylo provedeno:
1. ✅ Nainstalován PostgreSQL a vytvořena databáze
2. ✅ Nainstalován Node.js 18 a PM2
3. ✅ Vytvořena struktura projektu
4. ✅ Nainstalován backend (Express.js + Prisma)
5. ✅ Nainstalován frontend (Next.js + Tailwind CSS)
6. ✅ Provedena databázová migrace
7. ✅ Naplněna databáze ukázkovými daty
8. ✅ Vytvořeny spouštěcí skripty

## Přihlašovací údaje:
- **Email:** admin@fakturace.cz
- **Heslo:** admin123

## Databázové připojení:
- **Host:** localhost
- **Port:** 5432
- **Database:** fakturace_db
- **User:** fakturace_user
- **Password:** fakturace2025

## Jak spustit systém:
```bash
cd /path/to/project/fakturace
./start.sh
```

## Přístupové body:
- **Frontend:** http://localhost:3030
- **Backend API:** http://localhost:3002
- **Health check:** http://localhost:3002/api/health

## Doporučené další kroky:
1. Nakonfigurujte SSL/TLS certifikát a reverzní proxy (např. Nginx)
2. Nastavte pravidelné zálohování databáze a adresáře `backend/uploads`
3. Aktualizujte `.env` hodnoty pro produkční prostředí (JWT secret, bankovní údaje)

## Užitečné příkazy:
```bash
# Zobrazit logy
./logs.sh

# Zastavit systém
./stop.sh

# PM2 status
pm2 status

# Přístup do databáze
psql -U fakturace_user -d fakturace_db
```

## ⚠️ DŮLEŽITÉ:
- Změňte výchozí hesla v produkci
- Změňte JWT secret v .env souboru
- Nastavte správné CORS_ORIGIN pro produkci
