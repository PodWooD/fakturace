const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { setupTestEnvironment } = require('./helpers/testEnvironment');

let env;

before(async () => {
  env = await setupTestEnvironment('workflow');
});

test('Kompletní workflow: import → souhrn → faktura', async () => {
  const { request, prisma } = env;

  const loginResponse = await request
    .post('/api/auth/login')
    .send({ email: 'admin@fakturace.cz', password: 'admin123' })
    .expect(200);

  const token = loginResponse.body.token;
  assert.ok(token);

const worksheetData = [
  ['Datum', 'Organizace', 'Pracovník', 'Popis', 'Hodiny', 'Km'],
  ['1.7.2025', 'Workflow Test', 'Eva Testerová', 'Analýza', '3:15', '12'],
  ['2.7.2025', 'Workflow Test', 'Eva Testerová', 'Konfigurace', '2:00', '0']
];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'List1');
  const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const importResponse = await request
    .post('/api/import/excel')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', excelBuffer, 'workflow.xlsx')
    .expect(200);

  const importBody = importResponse.body;
  assert.equal(importBody.imported, 2);
  assert.equal(importBody.organizations, 1);
  assert.equal(importBody.details.newOrganizations, 1);
  assert.ok(Array.isArray(importBody.newlyCreatedOrganizations));
  assert.equal(importBody.newlyCreatedOrganizations.length, 1);

  const organizationId = importBody.newlyCreatedOrganizations[0].id;

  const monthsResponse = await request
    .get('/api/work-records/available-months')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const months = monthsResponse.body;
  // Test toleruje existenci dalších záznamů, kontrolujeme pouze přítomnost právě importovaného měsíce
  const hasJuly = months.some((m) => Number(m.month) === 7 && Number(m.year) === 2025 && Number(m.recordsCount) >= 2);
  assert.ok(hasJuly, `Dostupné měsíce musí obsahovat červenec 2025 (data: ${JSON.stringify(months)})`);

  const previewResponse = await request
    .post('/api/invoices/preview')
    .set('Authorization', `Bearer ${token}`)
    .send({ organizationId, month: 7, year: 2025 })
    .expect(200);

  const preview = previewResponse.body;
  assert.equal(preview.organization.id, organizationId);
  assert.equal(preview.workRecords.length, 2);
  assert.ok(Number(preview.totals.totalAmount) > 0);

  const generateResponse = await request
    .post('/api/invoices/generate')
    .set('Authorization', `Bearer ${token}`)
    .send({ organizationId, month: 7, year: 2025 })
    .expect(201);

  const generated = generateResponse.body;
  const generatedInvoice = generated.invoice || generated;
  assert.equal(generatedInvoice.organizationId, organizationId);
  assert.ok(Number(generated.totals.totalAmount) > 0);

  const listResponse = await request
    .get('/api/invoices')
    .set('Authorization', `Bearer ${token}`)
    .query({ month: 7, year: 2025 })
    .expect(200);

  const invoices = listResponse.body.data;
  assert.equal(invoices.length, 1);
  const invoiceId = invoices[0].id;

  await request
    .get(`/api/invoices/${invoiceId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const pdfResponse = await request
    .get(`/api/invoices/${invoiceId}/pdf`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(pdfResponse.body);

  const xmlResponse = await request
    .get(`/api/invoices/${invoiceId}/export`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(xmlResponse.text.includes('<?xml'));

  const batchResponse = await request
    .post('/api/invoices/export-batch')
    .set('Authorization', `Bearer ${token}`)
    .send({ invoiceIds: [invoiceId] })
    .expect(200);
  assert.ok(batchResponse.text.includes('<?xml'));

  // Faktura úspěšně vznikla a jde exportovat – ověřeno výše
});

after(async () => {
  if (env) {
    await env.cleanup();
  }
});
