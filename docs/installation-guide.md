# Instalační příručka - Fakturační Systém

## 📋 Obsah

1. [Požadavky](#požadavky)
2. [Rychlá instalace](#rychlá-instalace)
3. [Manuální instalace](#manuální-instalace)
4. [Konfigurace](#konfigurace)
5. [První spuštění](#první-spuštění)
6. [Produkční nasazení](#produkční-nasazení)
7. [Řešení problémů](#řešení-problémů)

## 🔧 Požadavky

### Minimální požadavky
- **OS:** Ubuntu 20.04+ / Debian 11+ / CentOS 8+ / Windows 10+ / macOS 10.15+
- **Node.js:** 18.0 nebo vyšší
- **npm:** 8.0 nebo vyšší
- **Databáze:** PostgreSQL 14+ nebo SQLite (pro development)
- **RAM:** 2 GB minimum (4 GB doporučeno)
- **Disk:** 1 GB volného místa

### Doporučené požadavky
- **CPU:** 2+ jádra
- **RAM:** 4 GB+
- **Disk:** SSD s 10 GB volného místa
- **Síť:** Stabilní internetové připojení

## 🚀 Rychlá instalace

### Automatický instalační skript (Linux/macOS)

```bash
# Stažení a spuštění instalačního skriptu
curl -fsSL https://raw.githubusercontent.com/your-username/fakturace-system/main/scripts/install.sh | bash

# nebo pomocí wget
wget -qO- https://raw.githubusercontent.com/your-username/fakturace-system/main/scripts/install.sh | bash
```

Skript automaticky:
- Nainstaluje všechny závislosti
- Vytvoří databázi
- Nakonfiguruje aplikaci
- Spustí systém

## 📝 Manuální instalace

### 1. Instalace Node.js

#### Ubuntu/Debian
```bash
# Přidání NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Instalace Node.js
sudo apt-get install -y nodejs

# Ověření instalace
node --version  # v18.x.x
npm --version   # 8.x.x
```

#### macOS (pomocí Homebrew)
```bash
# Instalace Homebrew (pokud nemáte)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Instalace Node.js
brew install node@18

# Ověření instalace
node --version
npm --version
```

#### Windows
1. Stáhněte installer z [nodejs.org](https://nodejs.org/)
2. Spusťte installer a postupujte podle pokynů
3. Restartujte terminál
4. Ověřte instalaci: `node --version`

### 2. Instalace databáze

#### PostgreSQL (produkce)

**Ubuntu/Debian:**
```bash
# Instalace PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Spuštění služby
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Vytvoření databáze a uživatele
sudo -u postgres psql

# V PostgreSQL konzoli:
CREATE DATABASE fakturace_db;
CREATE USER fakturace_user WITH ENCRYPTED PASSWORD 'silne_heslo_zde';
GRANT ALL PRIVILEGES ON DATABASE fakturace_db TO fakturace_user;
\q
```

**macOS:**
```bash
# Instalace pomocí Homebrew
brew install postgresql
brew services start postgresql

# Vytvoření databáze
createdb fakturace_db
```

#### SQLite (development)
SQLite nevyžaduje instalaci, Prisma jej vytvoří automaticky.

### 3. Klonování repozitáře

```bash
# Klonování repozitáře
git clone https://github.com/your-username/fakturace-system.git
cd fakturace-system

# nebo přes SSH
git clone git@github.com:your-username/fakturace-system.git
cd fakturace-system
```

### 4. Instalace závislostí

```bash
# Instalace root závislostí
npm install

# Instalace backend závislostí
cd backend
npm install

# Instalace frontend závislostí
cd ../frontend
npm install
cd ..
```

### 5. Konfigurace prostředí

```bash
# Vytvoření .env souboru z šablony
cd backend
cp .env.example .env

# Upravte .env soubor
nano .env  # nebo váš oblíbený editor
```

Příklad `.env` souboru:
```env
# Databáze - PostgreSQL
DATABASE_URL="postgresql://fakturace_user:silne_heslo_zde@localhost:5432/fakturace_db"

# Databáze - SQLite (pro development)
# DATABASE_URL="file:./dev.db"

# Server
NODE_ENV=development
PORT=3002

# JWT Secret (vygenerujte vlastní!)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# CORS
CORS_ORIGIN=http://localhost:3030

# Firemní údaje
COMPANY_NAME="Vaše firma s.r.o."
COMPANY_ICO="12345678"
COMPANY_DIC="CZ12345678"
COMPANY_ADDRESS="Ulice 123, 12345 Město"
COMPANY_PHONE="+420 123 456 789"
COMPANY_EMAIL="info@vase-firma.cz"
COMPANY_BANK_ACCOUNT="1234567890/0100"

# Email (volitelné)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### 6. Inicializace databáze

```bash
# Stále v backend složce
cd backend

# Generování Prisma klienta
npx prisma generate

# Spuštění migrací
npx prisma migrate deploy

# Seed databáze (vytvoření výchozích dat)
npm run seed

# Ověření databáze
npx prisma studio  # Otevře webové rozhraní pro prohlížení databáze
```

## ⚙️ Konfigurace

### Generování JWT Secret

```bash
# Linux/macOS
openssl rand -base64 32

# nebo Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Nastavení CORS

Pro produkci upravte `CORS_ORIGIN` na skutečnou doménu:
```env
CORS_ORIGIN=https://fakturace.vase-firma.cz
```

### Konfigurace portů

Výchozí porty:
- Backend: 3002
- Frontend: 3030

Změna portů:
```env
# Backend
PORT=3002

# Frontend (v frontend/.env.local)
NEXT_PUBLIC_API_URL=http://localhost:3002/api
```

## 🏃 První spuštění

### Development režim

```bash
# V kořenové složce projektu
npm run dev

# Nebo jednotlivě:
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### Produkční build

```bash
# Build frontend
cd frontend
npm run build

# Spuštění v produkci
cd ..
npm start
```

### Ověření instalace

1. Otevřete prohlížeč na `http://localhost:3030`
2. Přihlašte se výchozími údaji:
   - Email: `admin@fakturace.cz`
   - Heslo: `admin123`
3. **DŮLEŽITÉ:** Změňte výchozí heslo!

## 🚢 Produkční nasazení

### 1. PM2 Process Manager

```bash
# Instalace PM2
npm install -g pm2

# Spuštění aplikace
pm2 start ecosystem.config.js

# Nastavení automatického startu
pm2 save
pm2 startup

# Monitorování
pm2 monit
```

### 2. Nginx Reverse Proxy

```bash
# Instalace Nginx
sudo apt install nginx

# Vytvoření konfigurace
sudo nano /etc/nginx/sites-available/fakturace
```

Nginx konfigurace:
```nginx
server {
    listen 80;
    server_name fakturace.vase-firma.cz;

    # Frontend
    location / {
        proxy_pass http://localhost:3030;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Uploaded files
    location /uploads {
        alias /home/user/fakturace-system/backend/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Bezpečnostní hlavičky
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

```bash
# Aktivace konfigurace
sudo ln -s /etc/nginx/sites-available/fakturace /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. SSL/HTTPS pomocí Let's Encrypt

```bash
# Instalace Certbot
sudo apt install certbot python3-certbot-nginx

# Získání certifikátu
sudo certbot --nginx -d fakturace.vase-firma.cz

# Automatické obnovování
sudo certbot renew --dry-run
```

### 4. Firewall

```bash
# UFW firewall
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 5. Zálohování

Vytvoření zálohovacího skriptu:
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backup/fakturace"
DATE=$(date +%Y%m%d_%H%M%S)

# Vytvoření adresáře
mkdir -p $BACKUP_DIR

# Záloha databáze
pg_dump -U fakturace_user fakturace_db > $BACKUP_DIR/db_$DATE.sql

# Záloha souborů
tar -czf $BACKUP_DIR/files_$DATE.tar.gz \
    backend/uploads \
    backend/.env \
    frontend/.env.local

# Smazání starých záloh (starší než 30 dní)
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Záloha dokončena: $DATE"
```

```bash
# Nastavení pravidelného zálohování
crontab -e
# Přidejte řádek:
0 2 * * * /home/user/fakturace-system/scripts/backup.sh
```

## 🔧 Řešení problémů

### Časté problémy a řešení

#### 1. Cannot connect to database
```bash
# Kontrola PostgreSQL
sudo systemctl status postgresql

# Kontrola připojení
psql -U fakturace_user -d fakturace_db -h localhost

# Kontrola DATABASE_URL
echo $DATABASE_URL
```

#### 2. Port already in use
```bash
# Najít proces na portu
sudo lsof -i :3002
sudo lsof -i :3030

# Ukončit proces
kill -9 <PID>

# Nebo změnit port v .env
PORT=3002
```

#### 3. Permission denied
```bash
# Oprávnění pro upload složku
chmod -R 755 backend/uploads
chown -R www-data:www-data backend/uploads

# Node modules
rm -rf node_modules
npm install
```

#### 4. Prisma errors
```bash
# Regenerovat Prisma client
cd backend
npx prisma generate

# Reset databáze (POZOR: smaže data!)
npx prisma migrate reset
```

#### 5. Build errors
```bash
# Vyčistit cache
npm cache clean --force

# Reinstalovat závislosti
rm -rf node_modules package-lock.json
npm install

# Frontend build
cd frontend
rm -rf .next
npm run build
```

### Logování

```bash
# PM2 logy
pm2 logs

# Systemd logy
journalctl -u nginx -f
journalctl -u postgresql -f

# Aplikační logy
tail -f backend/logs/app.log
```

### Kontakt na podporu

Pokud narazíte na problém, který nemůžete vyřešit:

1. Zkontrolujte [dokumentaci](../README.md)
2. Hledejte v [Issues](https://github.com/your-username/fakturace-system/issues)
3. Vytvořte nový [Issue](https://github.com/your-username/fakturace-system/issues/new)
4. Kontaktujte podporu: support@vase-firma.cz

## ✅ Kontrolní seznam po instalaci

- [ ] Změnit výchozí heslo administrátora
- [ ] Nastavit silný JWT secret
- [ ] Nakonfigurovat CORS pro produkční doménu
- [ ] Nastavit SSL certifikát
- [ ] Nakonfigurovat firewall
- [ ] Nastavit pravidelné zálohování
- [ ] Otestovat import Excel souborů
- [ ] Vygenerovat testovací fakturu
- [ ] Zkontrolovat export do Pohody
- [ ] Nastavit monitoring (PM2/jiný)
