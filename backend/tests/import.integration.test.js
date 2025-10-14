const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { setupTestEnvironment } = require('./helpers/testEnvironment');

let env;

before(async () => {
  env = await setupTestEnvironment('import');
});

test('POST /api/import/excel importuje řádky z Excelu a vrátí detaily výsledku', async () => {
  const { request, prisma } = env;

  const loginResponse = await request
    .post('/api/auth/login')
    .send({ email: 'admin@fakturace.cz', password: 'admin123' })
    .expect(200);

  const token = loginResponse.body.token;
  assert.ok(token, 'Odpověď musí obsahovat JWT token');

  const worksheetData = [
    ['Datum', 'Organizace', 'Pracovník', 'Popis', 'Hodiny', 'Km'],
    ['15.7.2025', 'Testovací Organizace', 'Jan Tester', 'Instalace systému', '2:30', '15']
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Výkazy');
  const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const importResponse = await request
    .post('/api/import/excel')
    .set('Authorization', `Bearer ${token}`)
    .field('month', '7')
    .field('year', '2025')
    .attach('file', excelBuffer, 'vyjezdy.xlsx')
    .expect(200);

  const body = importResponse.body;

  assert.equal(body.success, true);
  assert.equal(body.imported, 1);
  assert.equal(body.organizations, 1);
  assert.deepEqual(body.details, {
    totalRows: 1,
    skippedRows: 0,
    newOrganizations: 1
  });
  assert.ok(Array.isArray(body.errors));
  assert.equal(body.errors.length, 0);

  const workRecordCount = await prisma.workRecord.count();
  assert.equal(workRecordCount, 1);

  const organization = await prisma.organization.findFirst({
    where: { name: 'Testovací Organizace' }
  });

  assert.ok(organization, 'Organizace vytvořená importem musí existovat');
});

after(async () => {
  if (env) {
    await env.cleanup();
  }
});
