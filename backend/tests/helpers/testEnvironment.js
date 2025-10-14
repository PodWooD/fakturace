const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const supertest = require('supertest');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

async function setupTestEnvironment(suiteName) {
  const tmpRoot = path.join(__dirname, '../tmp');
  const suiteDir = path.join(tmpRoot, suiteName);
  fs.mkdirSync(suiteDir, { recursive: true });

  const dbPath = path.join(suiteDir, 'test.db');
  const dbUrl = `file:${dbPath}`;

  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.CORS_ORIGIN = 'http://localhost:3030';
  process.env.DATABASE_URL = dbUrl;

  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  execSync('npx prisma db push --skip-generate', {
    cwd: path.join(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'ignore'
  });

  const prisma = new PrismaClient();

  const hashedPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.create({
    data: {
      email: 'admin@fakturace.cz',
      password: hashedPassword,
      name: 'Administrator',
      role: 'ADMIN'
    }
  });

  // Načti aplikaci až po nastavení env proměnných
  // (zajistí, že Prisma používá izolovanou DB)
  const app = require('../../src/app');
  const request = supertest(app);

  const cleanup = async () => {
    await prisma.$disconnect();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    if (fs.existsSync(suiteDir)) {
      fs.rmSync(suiteDir, { recursive: true, force: true });
    }
  };

  return { prisma, request, cleanup };
}

module.exports = {
  setupTestEnvironment
};
