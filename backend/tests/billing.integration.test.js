const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnvironment } = require('./helpers/testEnvironment');

let env;
let organizationId;

before(async () => {
  env = await setupTestEnvironment('billing');

  const { prisma } = env;

  const organization = await prisma.organization.create({
    data: {
      name: 'Test Fakturace s.r.o.',
      code: 'TF',
      hourlyRate: 650,
      kmRate: 12
    }
  });

  organizationId = organization.id;

  await prisma.service.create({
    data: {
      organizationId,
      serviceName: 'Outsourcing',
      description: 'Měsíční paušál',
      monthlyPrice: 5000,
      isActive: true
    }
  });

  const date = new Date(Date.UTC(2025, 6, 15));

  await prisma.workRecord.create({
    data: {
      organizationId,
      date,
      worker: 'Jan Technik',
      description: 'Servisní zásah',
      minutes: 180,
      kilometers: 20,
      month: 7,
      year: 2025
    }
  });

  await prisma.hardware.create({
    data: {
      organizationId,
      itemName: 'Switch 24 portů',
      description: 'Instalace pro centrálu',
      quantity: 1,
      unitPrice: 4500,
      totalPrice: 4500,
      month: 7,
      year: 2025
    }
  });
});

test('GET /api/billing/summary vrací základní data', async () => {
  const { request } = env;

  const loginResponse = await request
    .post('/api/auth/login')
    .send({ email: 'admin@fakturace.cz', password: 'admin123' })
    .expect(200);

  const token = loginResponse.body.token;

  const summaryResponse = await request
    .get('/api/billing/summary')
    .set('Authorization', `Bearer ${token}`)
    .query({ organizationId, month: 7, year: 2025 })
    .expect(200);

  const payload = summaryResponse.body;
  assert.ok(payload.base);
  assert.equal(payload.base.organization.id, organizationId);
  assert.equal(payload.base.services.length, 1);
  assert.equal(payload.base.work.entries.length, 1);
  assert.equal(payload.base.hardware.length, 1);
  assert.equal(payload.draft, null);
});

test('PUT /api/billing/draft uloží editovaná data', async () => {
  const { request } = env;

  const loginResponse = await request
    .post('/api/auth/login')
    .send({ email: 'admin@fakturace.cz', password: 'admin123' })
    .expect(200);

  const token = loginResponse.body.token;

  const draftPayload = {
    rates: {
      hourlyRate: '650',
      kmRate: '12',
      extraHourlyRate: '750',
      extraKmRate: '15'
    },
    services: [
      {
        id: null,
        serviceName: 'Konzultace',
        description: 'Ad-hoc práce',
        monthlyPrice: 1500
      }
    ],
    work: {
      entries: [
        {
          id: null,
          date: '2025-07-20',
          worker: 'Eva Testerová',
          description: 'Diagnostika',
          minutes: 120,
          hours: 2,
          kilometers: 10,
          hourlyAmount: 1400,
          kmAmount: 120
        }
      ],
      notes: 'Přidat do faktury jako mimořádný zásah.'
    },
    hardware: [],
    software: [],
    totalsOverride: {
      totalAmount: 2520,
      totalVat: 529.2,
      totalWithVat: 3049.2
    },
    notes: 'Ověřit ceny před vystavením.'
  };

  const saveResponse = await request
    .put('/api/billing/draft')
    .set('Authorization', `Bearer ${token}`)
    .send({
      organizationId,
      month: 7,
      year: 2025,
      data: draftPayload
    })
    .expect(200);

  assert.ok(saveResponse.body);
  assert.equal(saveResponse.body.data.notes, draftPayload.notes);

  const summaryResponse = await request
    .get('/api/billing/summary')
    .set('Authorization', `Bearer ${token}`)
    .query({ organizationId, month: 7, year: 2025 })
    .expect(200);

  assert.ok(summaryResponse.body.draft);
  assert.equal(summaryResponse.body.draft.data.notes, draftPayload.notes);
});

after(async () => {
  if (env) {
    await env.cleanup();
  }
});
