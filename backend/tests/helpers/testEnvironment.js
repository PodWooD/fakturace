const { execSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const supertest = require('supertest');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

async function setupTestEnvironment(suiteName) {
  const dbName = `test_${suiteName}_${crypto.randomBytes(4).toString('hex')}`;
  const adminConnection = new URL(process.env.TEST_DATABASE_URL || 'postgresql://fakturace:fakturace@localhost:5433/fakturace');
  const adminUrl = adminConnection.toString();

  const createDatabase = `CREATE DATABASE "${dbName}";`;
  const dropDatabase = `DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE);`;
  execSync(`psql "${adminUrl}" -c "${dropDatabase}"`);
  execSync(`psql "${adminUrl}" -c "${createDatabase}"`);

  const testConnection = new URL(adminUrl);
  testConnection.pathname = `/${dbName}`;
  const testDbUrl = testConnection.toString();

  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.CORS_ORIGIN = 'http://localhost:3030';
  process.env.DATABASE_URL = testDbUrl;

  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'ignore'
  });

  const prisma = new PrismaClient();

  const hashedPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.create({
    data: {
      email: 'admin@fakturace.cz',
      password: hashedPassword,
      name: 'Administrator',
      role: 'ADMIN',
    },
  });

  // Načti aplikaci až po nastavení env proměnných
  // (zajistí, že Prisma používá izolovanou DB)
  // Use dist/app because we are using TypeScript implementation
  const app = require('../../dist/app').default;
  const request = supertest(app);

  const cleanup = async () => {
    await prisma.$disconnect();
    execSync(`psql "${adminUrl}" -c "DROP DATABASE IF EXISTS \"${dbName}\" WITH (FORCE);"`);
  };

  return { prisma, request, cleanup };
}

module.exports = {
  setupTestEnvironment
};
