#!/bin/bash

# Deployment skript pro Fakturační systém
# Použití: ./deploy-to-new-server.sh

echo "=== Instalace Fakturačního systému ==="

# 1. Kontrola prerequisites
echo "1. Kontrola systémových požadavků..."

# Kontrola Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js není nainstalován!"
    echo "Nainstalujte Node.js 18 nebo vyšší:"
    echo "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "sudo apt-get install -y nodejs"
    exit 1
fi

# Kontrola PostgreSQL
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL není nainstalován!"
    echo "Nainstalujte PostgreSQL:"
    echo "sudo apt-get install postgresql postgresql-contrib"
    exit 1
fi

# Kontrola PM2
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

echo "✅ Všechny systémové požadavky splněny"

# 2. Nastavení databáze
echo ""
echo "2. Nastavení databáze..."
echo "Spustím nastavení databáze (budete vyzváni k zadání hesla postgres):"

sudo -u postgres psql << EOF
-- Vytvoření uživatele a databáze
CREATE USER fakturace_user WITH PASSWORD 'fakturace2025';
CREATE DATABASE fakturace_db OWNER fakturace_user;
ALTER USER fakturace_user CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE fakturace_db TO fakturace_user;
\q
EOF

echo "✅ Databáze vytvořena"

# 3. Instalace závislostí
echo ""
echo "3. Instalace závislostí..."

# Backend
cd backend
npm install
echo "✅ Backend závislosti nainstalovány"

# Aplikace databázových migrací
npx prisma migrate deploy
npx prisma generate
echo "✅ Databázové migrace aplikovány"

# Frontend
cd ../frontend
npm install
npm run build
echo "✅ Frontend závislosti nainstalovány a build dokončen"

# 4. Konfigurace
echo ""
echo "4. Konfigurace prostředí..."

# Vytvoření .env souboru pro backend
cd ../backend
if [ ! -f .env ]; then
    cat > .env << 'EOL'
NODE_ENV=production
PORT=3002
DATABASE_URL="postgresql://fakturace_user:fakturace2025@localhost:5432/fakturace_db"
JWT_SECRET=super-secret-jwt-key-please-change-this
CORS_ORIGIN=http://YOUR_SERVER_IP:3030
COMPANY_NAME="Vaše firma s.r.o."
COMPANY_ICO="12345678"
COMPANY_DIC="CZ12345678"
EOL
    echo "⚠️  DŮLEŽITÉ: Upravte .env soubor v backend složce:"
    echo "   - Změňte CORS_ORIGIN na vaši IP adresu"
    echo "   - Změňte JWT_SECRET na bezpečné heslo"
    echo "   - Upravte firemní údaje"
fi

# 5. Vytvoření výchozího admin uživatele
echo ""
echo "5. Vytvoření admin uživatele..."

cd ../backend
node -e "
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createAdmin() {
  try {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: {
        email: 'admin@firma.cz',
        password: hashedPassword,
        name: 'Administrator',
        role: 'ADMIN'
      }
    });
    console.log('✅ Admin uživatel vytvořen: admin@firma.cz / admin123');
  } catch (error) {
    if (error.code === 'P2002') {
      console.log('ℹ️  Admin uživatel již existuje');
    } else {
      console.error('Chyba:', error);
    }
  } finally {
    await prisma.\$disconnect();
  }
}
createAdmin();
"

# 6. Spuštění aplikace
echo ""
echo "6. Spuštění aplikace pomocí PM2..."

cd ..
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo ""
echo "=== ✅ INSTALACE DOKONČENA ==="
echo ""
echo "Aplikace běží na:"
echo "  Frontend: http://YOUR_SERVER_IP:3030"
echo "  Backend API: http://localhost:3002"
echo ""
echo "Přihlašovací údaje:"
echo "  Email: admin@firma.cz"
echo "  Heslo: admin123"
echo ""
echo "PM2 příkazy:"
echo "  pm2 status     - zobrazit stav aplikace"
echo "  pm2 logs       - zobrazit logy"
echo "  pm2 restart all - restartovat vše"
echo ""
echo "⚠️  NEZAPOMEŇTE:"
echo "1. Upravit backend/.env soubor (CORS_ORIGIN na vaši IP)"
echo "2. Otevřít porty 3030 a 3002 ve firewallu"
echo "3. Změnit výchozí hesla"