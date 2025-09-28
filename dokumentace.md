# Fakturační Systém - Kompletní Dokumentace

## 📋 Obsah
1. [Přehled projektu](#přehled-projektu)
2. [Technologie](#technologie)
3. [Struktura projektu](#struktura-projektu)
4. [Instalace](#instalace)
5. [Databázové schéma](#databázové-schéma)
6. [API dokumentace](#api-dokumentace)
7. [Frontend komponenty](#frontend-komponenty)
8. [Import dat z Excelu](#import-dat-z-excelu)
9. [Integrace s Pohodou](#integrace-s-pohodou)
10. [Deployment](#deployment)
11. [Údržba a monitoring](#údržba-a-monitoring)

---

## 🎯 Přehled projektu

Systém automatizované fakturace pro IT služby, který umožňuje import pracovních výkazů z Excelu, jejich správu a generování faktur s exportem do účetního systému Pohoda.

### Hlavní funkce
- ✅ Import dat z Excel výkazů
- ✅ Správa organizací s individuálními cenovými podmínkami
- ✅ Online editace všech dat
- ✅ Automatické výpočty (hodiny × sazba + km × sazba/km)
- ✅ Generování PDF faktur
- ✅ Export do Pohody (XML formát)
- ✅ Správa paušálních služeb
- ✅ Evidence fakturovaného hardware

---

## 💻 Technologie

### Backend
- **Node.js 18+** - serverové prostředí
- **Express.js** - webový framework
- **PostgreSQL 14+** - databáze
- **Prisma ORM** - databázový ORM
- **JWT** - autentizace
- **Multer** - upload souborů
- **XLSX** - zpracování Excel souborů
- **XMLBuilder2** - generování XML pro Pohodu
- **PDFKit** - generování PDF

### Frontend
- **Next.js 14** - React framework
- **TypeScript** - typový systém
- **Tailwind CSS** - styling
- **React Hook Form** - formuláře
- **TanStack Query** - state management
- **TanStack Table** - tabulky
- **Recharts** - grafy
- **Axios** - HTTP klient

### DevOps
- **PM2** - process manager
- **Nginx** - reverse proxy
- **Git** - verzování

---

## 📁 Struktura projektu

```bash
fakturace/
├── backend/
│   ├── src/
│   │   ├── app.js               # Hlavní Express aplikace
│   │   ├── middleware/          # Autentizace a pomocné middleware
│   │   ├── routes/              # REST API routy (auth, import, invoices…)
│   │   └── services/            # PDF a Pohoda export
│   ├── prisma/
│   │   ├── schema.prisma        # Databázové schéma
│   │   └── seed.js              # Výchozí data
│   ├── package.json
│   └── package-lock.json
├── frontend/
│   ├── src/
│   │   ├── components/          # Sdílené layouty a UI prvky
│   │   ├── config/              # API konfigurace
│   │   ├── pages/               # Next.js stránky (dashboard, faktury…)
│   │   └── styles/              # Globální styly
│   ├── package.json
│   └── next.config.js
├── docs/                        # Detailní dokumentace
├── start.sh                     # Spouštěcí skript pro PM2
├── ecosystem.config.js          # PM2 konfigurace
├── README.md
└── LICENSE
```

---

## 🚀 Instalace

### 1. Rychlá instalace (automatická)

```bash
# Stažení a spuštění instalačního skriptu
wget https://your-repo/setup.sh
chmod +x setup.sh
./setup.sh
```

### 2. Manuální instalace

#### Požadavky
- Ubuntu 20.04+ nebo jiná Linux distribuce
- Node.js 18+
- PostgreSQL 14+
- npm nebo yarn

#### Kroky instalace

```bash
# 1. Aktualizace systému
sudo apt update && sudo apt upgrade -y

# 2. Instalace Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Instalace PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# 4. Instalace PM2
sudo npm install -g pm2

# 5. Klonování repozitáře
git clone [váš-repozitář]
cd fakturace-system

# 6. Instalace závislostí
cd backend && npm install
cd ../frontend && npm install

# 7. Nastavení databáze
sudo -u postgres psql
CREATE DATABASE fakturace_db;
CREATE USER fakturace_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE fakturace_db TO fakturace_user;
\q

# 8. Konfigurace prostředí
cd backend
cp .env.example .env
nano .env  # Upravte hodnoty

# 9. Migrace databáze
npx prisma migrate deploy
npx prisma db seed

# 10. Build frontend
cd ../frontend
npm run build

# 11. Spuštění aplikace
cd ..
pm2 start ecosystem.config.js
```

### 3. Environment proměnné

```env
# Backend (.env)
NODE_ENV=production
PORT=3002
DATABASE_URL="postgresql://fakturace_user:password@localhost:5432/fakturace_db"
JWT_SECRET=your-super-secret-jwt-key
CORS_ORIGIN=http://localhost:3030

# Firemní údaje
COMPANY_NAME="Vaše firma s.r.o."
COMPANY_ICO="12345678"
COMPANY_DIC="CZ12345678"

# Email (volitelné)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

---

## 🗄️ Databázové schéma

### Hlavní tabulky

```sql
-- Organizace (klienti)
CREATE TABLE organizations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    contact_person VARCHAR(255),
    hourly_rate DECIMAL(10,2) NOT NULL,
    km_rate DECIMAL(10,2) NOT NULL,
    address TEXT,
    ico VARCHAR(20),
    dic VARCHAR(20),
    email VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Paušální služby
CREATE TABLE services (
    id SERIAL PRIMARY KEY,
    organization_id INT REFERENCES organizations(id),
    service_name VARCHAR(255) NOT NULL,
    description TEXT,
    monthly_price DECIMAL(10,2) NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- Pracovní výkazy
CREATE TABLE work_records (
    id SERIAL PRIMARY KEY,
    organization_id INT REFERENCES organizations(id),
    billing_org_id INT REFERENCES organizations(id), -- Organizace pro fakturaci
    date DATE NOT NULL,
    worker_name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    hours VARCHAR(10) NOT NULL, -- Format "HH:MM" 
    kilometers INT DEFAULT 0,
    month INT NOT NULL,
    year INT NOT NULL,
    price DECIMAL(10,2),
    project_code VARCHAR(100), -- Kód zakázky
    imported_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_month_year (month, year),
    INDEX idx_project_code (project_code)
);

-- Fakturovaný hardware
CREATE TABLE hardware (
    id SERIAL PRIMARY KEY,
    organization_id INT REFERENCES organizations(id),
    item_name VARCHAR(255) NOT NULL,
    description TEXT,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    month INT NOT NULL,
    year INT NOT NULL
);

-- Faktury
CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    organization_id INT REFERENCES organizations(id),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    month INT NOT NULL,
    year INT NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    total_vat DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'DRAFT',
    generated_at TIMESTAMP DEFAULT NOW(),
    pdf_url VARCHAR(500),
    pohoda_xml TEXT,
    notes TEXT,
    INDEX idx_invoice_period (month, year)
);

-- Uživatelé
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'USER',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Mapování organizací

```javascript
// Mapování názvů z výkazu na kódy organizací
const organizationMapping = {
    'LT - Lázně Toušeň': 'LT',
    'O - Oresi': 'O',
    'OSK - Oresi SK': 'OSK',
    'TVMNET  - TVM NET GROUP': 'TVMNET',
    'MŠSKALICE - Skalice - Školka': 'MSSKALICE',
    'DOH - Oresi - Dohnal': 'DOH',
    'AWC - AmbassadorWineClub': 'AWC',
    'CEN - Centrála': 'CEN',
    'ERW - EraWine': 'ERW',
    'GON - Oresi - Gonda': 'GON',
    'KOP - Oresi - Kopecký': 'KOP',
    'PBC - Prague Body Clinic': 'PBC',
    'VAJ - Oresi - Vajnlich': 'VAJ'
};
```

---

## 🔌 API dokumentace

### Autentizace

```http
POST /api/auth/login
Content-Type: application/json

{
    "email": "admin@fakturace.cz",
    "password": "admin123"
}

Response:
{
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
        "id": 1,
        "email": "admin@fakturace.cz",
        "name": "Administrator",
        "role": "ADMIN"
    }
}
```

### Organizace

```http
# Seznam organizací
GET /api/organizations
Authorization: Bearer <token>

# Detail organizace
GET /api/organizations/:id
Authorization: Bearer <token>

# Vytvoření organizace
POST /api/organizations
Authorization: Bearer <token>
Content-Type: application/json

{
    "name": "Nová firma s.r.o.",
    "code": "NF",
    "hourlyRate": 600,
    "kmRate": 12,
    "contactPerson": "Jan Novák",
    "email": "info@nova-firma.cz"
}

# Aktualizace organizace
PUT /api/organizations/:id
Authorization: Bearer <token>

# Smazání organizace
DELETE /api/organizations/:id
Authorization: Bearer <token>
```

### Import výkazů

```http
POST /api/import
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <Excel soubor>
month: 7
year: 2025

Response:
{
    "success": true,
    "imported": 82,
    "organizations": 13,
    "errors": []
}
```

### Pracovní výkazy

```http
# Seznam výkazů
GET /api/work-records?month=7&year=2025&organizationId=1
Authorization: Bearer <token>

# Vytvoření/úprava výkazu
POST /api/work-records
PUT /api/work-records/:id

{
    "organizationId": 1,
    "date": "2025-07-14",
    "workerName": "Jan Novák",
    "description": "Instalace serveru",
    "hours": "8:30",
    "kilometers": 120
}
```

### Faktury

```http
# Generování faktury
POST /api/invoices/generate
Authorization: Bearer <token>

{
    "organizationId": 1,
    "month": 7,
    "year": 2025
}

# Export do Pohody
GET /api/invoices/:id/pohoda-xml
Authorization: Bearer <token>

# Export PDF
GET /api/invoices/:id/pdf
Authorization: Bearer <token>
```

---

## 🎨 Frontend komponenty

### Dashboard
- Přehledové statistiky
- Rychlé akce
- Seznam nedokončených faktur
- Grafy a vizualizace

### Správa organizací
- Tabulka s inline editací
- Správa cenových podmínek
- Nastavení paušálních služeb

### Import výkazů
- Drag & drop upload
- Validace dat
- Mapování organizací
- Progress bar

### Editor faktur
- Editace všech položek
- Automatické přepočty
- Přidávání/odebírání řádků
- Sekce pro hardware
- Poznámka o DPH

### Seznam faktur
- Filtrování podle měsíce
- Stavy faktur
- Hromadné akce
- Export do PDF/XML

---

## 📥 Import dat z Excelu

### Očekávaná struktura Excel souboru

| Sloupec | Název | Popis |
|---------|-------|-------|
| A | # | Číslo řádku |
| B | Pracovník | Jméno pracovníka |
| C | Datum | Datum práce |
| D | Den | Den v týdnu |
| E | Od | Čas začátku |
| F | Do | Čas konce |
| G | Počet hodin | Odpracované hodiny |
| H | Popis | Popis práce |
| I | Společnost-pobočka | Pobočka |
| J | Zakázka | Kód zakázky |
| K | Výjezd (km) | Ujeté kilometry |
| L | Členění zakázky | Další členění |

### Proces importu

```javascript
// 1. Upload souboru
const formData = new FormData();
formData.append('file', excelFile);
formData.append('month', '7');
formData.append('year', '2025');

// 2. Odeslání na server
const response = await fetch('/api/import', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`
    },
    body: formData
});

// 3. Zpracování na serveru
- Parsování Excel souboru
- Mapování organizací
- Validace dat
- Výpočet cen
- Uložení do databáze
```

---

## 🏢 Integrace s Pohodou

### Generování XML

Systém generuje XML soubory kompatibilní s Pohodou ve verzi 2.0:

```xml
<?xml version="1.0" encoding="Windows-1250"?>
<dat:dataPack version="2.0" xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd">
    <dat:dataPackItem id="FA2025070001" version="2.0">
        <inv:invoice version="2.0">
            <inv:invoiceHeader>
                <inv:invoiceType>issuedInvoice</inv:invoiceType>
                <inv:number>
                    <typ:numberRequested>2025070001</typ:numberRequested>
                </inv:number>
                <inv:symVar>2025070001</inv:symVar>
                <inv:date>2025-07-31</inv:date>
                <inv:dateTax>2025-07-31</inv:dateTax>
                <inv:dateDue>2025-08-14</inv:dateDue>
                <inv:text>Faktura za IT služby 07/2025</inv:text>
                <inv:partnerIdentity>
                    <typ:address>
                        <typ:company>Lázně Toušeň</typ:company>
                        <typ:ico>45678901</typ:ico>
                    </typ:address>
                </inv:partnerIdentity>
            </inv:invoiceHeader>
            <inv:invoiceDetail>
                <inv:invoiceItem>
                    <inv:text>Práce IT technika</inv:text>
                    <inv:quantity>1.0</inv:quantity>
                    <inv:unit>hod</inv:unit>
                    <inv:homeCurrency>
                        <typ:unitPrice>550</typ:unitPrice>
                        <typ:price>550</typ:price>
                    </inv:homeCurrency>
                </inv:invoiceItem>
            </inv:invoiceDetail>
        </inv:invoice>
    </dat:dataPackItem>
</dat:dataPack>
```

### Import do Pohody

1. Vygenerovat XML v aplikaci
2. Stáhnout XML soubor
3. V Pohodě: Menu → Soubor → Import → XML
4. Vybrat stažený soubor
5. Zkontrolovat a potvrdit import

---

## 🚢 Deployment

### PM2 konfigurace

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'fakturace-backend',
      script: './backend/src/app.js',
      instances: 2,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    },
    {
      name: 'fakturace-frontend',
      script: 'npm',
      args: 'start',
      cwd: './frontend',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3030
      }
    }
  ]
};
```

### Nginx konfigurace

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:3030;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Uploaded files
    location /uploads {
        alias /home/user/fakturace-system/backend/uploads;
    }
}
```

### Spouštění aplikace

```bash
# Start
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Stop
pm2 stop all

# Restart
pm2 restart all

# Logy
pm2 logs

# Monitoring
pm2 monit
```

---

## 🔧 Údržba a monitoring

### Denní úkoly

```bash
# Kontrola statusu
pm2 status

# Kontrola logů
pm2 logs --lines 100

# Kontrola místa na disku
df -h
```

### Týdenní úkoly

```bash
# Záloha databáze
pg_dump -U fakturace_user fakturace_db > backup_$(date +%Y%m%d).sql

# Záloha uploadů
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz backend/uploads/

# Kontrola aktualizací
npm outdated
```

### Měsíční úkoly

```bash
# Vyčištění starých logů
pm2 flush

# Optimalizace databáze
sudo -u postgres psql -d fakturace_db -c "VACUUM ANALYZE;"

# Kontrola bezpečnosti
npm audit
```

### Zálohovací strategie

```bash
#!/bin/bash
# backup.sh

# Nastavení
BACKUP_DIR="/backup/fakturace"
DB_NAME="fakturace_db"
DB_USER="fakturace_user"
DATE=$(date +%Y%m%d_%H%M%S)

# Vytvoření adresáře
mkdir -p $BACKUP_DIR

# Záloha databáze
pg_dump -U $DB_USER $DB_NAME > $BACKUP_DIR/db_$DATE.sql

# Záloha souborů
tar -czf $BACKUP_DIR/files_$DATE.tar.gz \
    backend/uploads \
    backend/.env \
    frontend/.env.local

# Smazání starých záloh (starší než 30 dní)
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Záloha dokončena: $DATE"
```

---

## 🔐 Bezpečnost

### Základní opatření

1. **Firewall**
```bash
sudo ufw allow 22/tcp  # SSH
sudo ufw allow 80/tcp  # HTTP
sudo ufw allow 443/tcp # HTTPS
sudo ufw enable
```

2. **SSL certifikát**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

3. **Fail2ban**
```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

4. **Environment proměnné**
- Nikdy necommitovat .env soubory
- Používat silná hesla
- Pravidelně měnit JWT secret

### Kontrolní seznam před produkcí

- [ ] Změnit všechna výchozí hesla
- [ ] Nastavit SSL certifikát
- [ ] Omezit CORS na produkční doménu
- [ ] Vypnout debug režim
- [ ] Nastavit firewall pravidla
- [ ] Implementovat rate limiting
- [ ] Nastavit pravidelné zálohy
- [ ] Monitoring a alerting

---

## 📞 Podpora

### Řešení problémů

```bash
# Aplikace nefunguje
pm2 status
pm2 restart all

# Databázové problémy
sudo systemctl status postgresql
sudo -u postgres psql -d fakturace_db

# Port je obsazený
netstat -tulpn | grep :3030
# Kontrola běžícího backendu
netstat -tulpn | grep :3002

# Chybějící závislosti
cd backend && npm install
cd ../frontend && npm install

# Oprávnění souborů
chmod -R 755 backend/uploads
chown -R www-data:www-data backend/uploads
```

### Časté problémy

| Problém | Řešení |
|---------|--------|
| Cannot connect to database | Zkontrolovat DATABASE_URL v .env |
| Port already in use | Zastavit proces na portu nebo změnit port |
| Import fails | Zkontrolovat formát Excel souboru |
| PDF generation error | Nainstalovat fonts: `sudo apt install fonts-liberation` |
| Pohoda XML invalid | Zkontrolovat kódování (Windows-1250) |

---

## 📚 Další zdroje

- [Prisma dokumentace](https://www.prisma.io/docs)
- [Next.js dokumentace](https://nextjs.org/docs)
- [Pohoda XML formát](https://www.stormware.cz/pohoda/xml/)
- [PM2 dokumentace](https://pm2.keymetrics.io/)

---

## 📝 Licence a autoři

**Verze**: 1.0.0  
**Datum vydání**: Leden 2025  
**Autor**: IT Team  
**Kontakt**: support@your-company.com

---

## 🚀 Rychlý start

```bash
# 1. Klonování repozitáře
git clone https://github.com/your-company/fakturace-system.git
cd fakturace-system

# 2. Spuštění instalačního skriptu
chmod +x scripts/setup.sh
./scripts/setup.sh

# 3. Spuštění aplikace
./scripts/start.sh

# 4. Otevření v prohlížeči
# Frontend: http://localhost:3030
# API: http://localhost:3002

# 5. Přihlášení
# Email: admin@fakturace.cz
# Heslo: admin123
```

**Systém je nyní připraven k použití!** 🎉
