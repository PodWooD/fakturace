# Fakturační Systém

Automatizovaný systém pro správu a fakturaci IT služeb s importem dat z Excel výkazů, generováním PDF faktur a exportem do účetního systému Pohoda.

## 🚀 Rychlý start

```bash
# Klonování repozitáře
git clone https://github.com/PodWooD/fakturace-system.git
cd fakturace-system

# Instalace závislostí
npm install
cd backend && npm install
cd ../frontend && npm install

# Nastavení databáze
cd ../backend
cp .env.example .env
# Upravte .env soubor s vašimi údaji

# Migrace databáze
npx prisma migrate deploy
npx prisma db seed

# Spuštění aplikace
cd ..
./start.sh

# Aplikace běží na:
# Frontend: http://localhost:3030
# Backend API: http://localhost:3002
```

**Výchozí přihlašovací údaje:**
- Email: admin@fakturace.cz
- Heslo: admin123

## ✨ Hlavní funkce

- 📊 **Import dat z Excel** - Automatický import pracovních výkazů
- 🏢 **Správa organizací** - Individuální cenové podmínky pro každého klienta
- ✏️ **Online editace** - Úprava všech dat přímo v aplikaci
- 🧮 **Automatické výpočty** - Hodiny × sazba + km × sazba/km
- 📄 **Generování PDF faktur** - Profesionální faktury s vaším logem
- 🔄 **Export do Pohody** - XML formát kompatibilní s Pohoda 2.0
- 💼 **Paušální služby** - Správa pravidelných měsíčních služeb
- 🖥️ **Evidence hardware** - Fakturace prodaného hardware
- 🧾 **Import přijatých faktur (OCR)** - Mistral OCR rozpozná položky, které se dají schválit a přiřadit
- 📥 **Hromadný import** - Excel výkazy i PDF faktury lze nahrát po více souborech s průběhem nahrávání
- 📱 **Responzivní design** - Plně funkční na mobilech, tabletech i desktop
- 💶 **Návrhy fakturace** - Nová záložka pro editaci všech položek před generováním faktury

## 📋 Požadavky

- Node.js 18+
- PostgreSQL 14+ (nebo SQLite pro development)
- npm nebo yarn

## 🛠️ Technologie

**Backend:**
- Node.js + Express.js
- Prisma ORM
- JWT autentizace
- PDFKit pro generování PDF
- XMLBuilder2 pro Pohoda export

**Frontend:**
- Next.js 14
- TypeScript
- Tailwind CSS (včetně responzivního designu)
- TanStack Query & Table

## 📱 Responzivní design

Aplikace je **plně optimalizována pro všechna zařízení**:

**📱 Mobilní zařízení (< 768px):**
- Hamburger menu pro intuitivní navigaci
- Touch-optimalizované tlačítka (min 44px)
- Responzivní tabulky s horizontal scrollem
- 1-column layout pro lepší čitelnost
- Optimalizované fonty a spacing

**📲 Tablety (768px - 1024px):**
- 2-column grid layout
- Plná navigace nebo hamburger menu dle velikosti
- Touch-friendly rozhraní

**🖥️ Desktop (> 1024px):**
- Plná horizontální navigace
- Multi-column layouts
- Optimalizované pro myš a klávesnici

**Testování:**
```bash
# Chrome DevTools Device Mode
F12 → Ctrl+Shift+M → Vyber mobilní zařízení
```

## 📁 Struktura projektu

```
fakturace-system/
├── backend/           # Express.js API server
├── frontend/          # Next.js aplikace
├── scripts/           # Pomocné skripty
├── docs/              # Dokumentace
└── database/          # Databázové skripty
```

## 🔧 Konfigurace

Vytvořte `.env` soubor v `backend/` složce:

```env
# Databáze
DATABASE_URL="postgresql://user:password@localhost:5432/fakturace_db"

# Pro SQLite (development):
# DATABASE_URL="file:./dev.db"

# Server
PORT=3002
NODE_ENV=production

# JWT
JWT_SECRET=your-super-secret-jwt-key

# CORS
CORS_ORIGIN=http://localhost:3030

# OCR (Mistral)
MISTRAL_OCR_API_KEY="your-mistral-api-key"
MISTRAL_OCR_URL="https://api.mistral.ai/v1/ocr"
MISTRAL_OCR_LANGUAGE="cs"

# Firemní údaje
COMPANY_NAME="Vaše firma s.r.o."
COMPANY_ICO="12345678"
COMPANY_DIC="CZ12345678"
COMPANY_ADDRESS="Ulice 123, 12345 Město"
COMPANY_PHONE="+420 123 456 789"
COMPANY_EMAIL="info@vase-firma.cz"
COMPANY_BANK_ACCOUNT="1234567890/0100"
```

Pro frontend vytvořte `.env.local` podle šablony `.env.local.example`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3002
```

## 📚 Dokumentace

- [Kompletní dokumentace](./docs/dokumentace.md)
- [API dokumentace](./docs/api-documentation.md)
- [Instalační příručka](./docs/installation-guide.md)
- [Uživatelská příručka](./docs/user-guide.md)
- [Vizuální dokumentace](./docs/visual-documentation.md)

## 📥 Import dat v aplikaci

- **Excel výkazy** – na stránce Import dat můžete nahrát více souborů `.xlsx/.xls`. Pro každý soubor vidíte průběh nahrávání, stav a zprávu z backendu. Měsíc/rok se nastavují globálně před spuštěním importu.
- **Přijaté faktury (PDF)** – do téže stránky jde přidat libovolný počet faktur. Backend je odešle do OCR Mistral (viz `.env`), položky se zobrazí v záložkách „Faktury přijaté“ (ruční kontrola) a „Hardware“ (přiřazení organizaci). Z fakturace se potom dají natáhnout přímo do draftu.
- Importy běží postupně a zobrazený progress bar odpovídá skutečnému uploadu souboru.

## ✅ CI/CD

Repo obsahuje GitHub Actions workflow (`.github/workflows/test.yml`), které na každém pushi/pull requestu:
- nainstaluje závislosti
- spustí backend testy přes `npm test`
- spustí Playwright E2E testy

## 🔐 Bezpečnostní poznámka

Knihovna `xlsx` (SheetJS) má aktuálně hlášenou zranitelnost (prototype pollution, ReDoS) bez dostupné opravy. V případě nasazení do produkčního prostředí doporučujeme sledovat vydání opravované verze nebo zvážit nasazení mitigací (sandboxování importu, omezení přístupu, validace souborů).

## 🚀 Deployment

### PM2 (doporučeno)

```bash
# Instalace PM2
npm install -g pm2

# Spuštění aplikace
pm2 start ecosystem.config.js

# Nastavení automatického startu
pm2 save
pm2 startup
```

### Docker

```bash
# Build a spuštění
docker-compose up -d
```

## 📊 Import dat z Excelu

Systém očekává Excel soubor s následující strukturou:

| Sloupec | Název | Popis |
|---------|-------|-------|
| B | Pracovník | Jméno pracovníka |
| C | Datum | Datum práce |
| G | Počet hodin | Odpracované hodiny |
| H | Popis | Popis práce |
| I | Společnost-pobočka | Název organizace |
| K | Výjezd (km) | Ujeté kilometry |

## 🤝 Přispívání

1. Forkněte repozitář
2. Vytvořte feature branch (`git checkout -b feature/AmazingFeature`)
3. Commitněte změny (`git commit -m 'Add some AmazingFeature'`)
4. Pushněte do branch (`git push origin feature/AmazingFeature`)
5. Otevřete Pull Request

## 📝 Licence

Tento projekt je licencován pod MIT licencí - viz [LICENSE](LICENSE) soubor.

## 👥 Autoři

- Váš tým - *Initial work*

## 🙏 Poděkování

- Děkujeme všem contributorům
- Inspirace z různých open-source projektů

---

**Poznámka:** Pro produkční nasazení nezapomeňte změnit všechna výchozí hesla a JWT secret!
