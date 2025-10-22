/**
 * Lightweight Puppeteer smoke test for the Fakturace frontend.
 * The script mocks backend API responses so it can run without
 * a running server or database.
 */

const fs = require('fs');
const puppeteer = require('puppeteer');

const BASE_URL = 'http://localhost:3030';
const API_ORIGIN = 'http://localhost:3029';
const SCREENSHOT_DIR = './test-screenshots';

const MOCK_USER = {
  id: 1,
  email: 'admin@fakturace.cz',
  name: 'Administrator',
  role: 'ADMIN',
};

const respond = (request, body, status = 200) =>
  request.respond({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

async function installApiMocks(page) {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    const method = request.method();

    if (url.startsWith(`${API_ORIGIN}/api/`)) {
      const pathname = new URL(url).pathname;

      if (pathname === '/api/auth/login' && method === 'POST') {
        return respond(request, { token: 'mock-token', user: MOCK_USER });
      }

      if (pathname === '/api/auth/verify' && method === 'GET') {
        return respond(request, { user: MOCK_USER });
      }

      if (pathname.startsWith('/api/work-records/available-months')) {
        return respond(request, [
          { month: 7, year: 2025, recordsCount: 2, label: 'červenec 2025', monthName: 'červenec' },
        ]);
      }

      if (pathname.startsWith('/api/work-records/summary/')) {
        return respond(request, [
          {
            organization: { id: 1, name: 'NoReason - centrála', code: 'NRCEN' },
            recordsCount: 2,
            totalHours: 7.5,
            totalKm: 42,
            hourlyAmount: 41250,
            kmAmount: 420,
            totalAmount: 41670,
            invoice: { status: 'DRAFT', invoiceNumber: '2025-0001' },
          },
        ]);
      }

      if (pathname === '/api/invoices' && method === 'GET') {
        return respond(request, {
          data: [
            {
              id: 1,
              invoiceNumber: '2025-0001',
              status: 'DRAFT',
              totalAmount: 41670,
              organization: { id: 1, name: 'NoReason - centrála' },
            },
          ],
        });
      }

      if (pathname === '/api/invoices/1' && method === 'GET') {
        return respond(request, {
          id: 1,
          invoiceNumber: '2025-0001',
          status: 'DRAFT',
          totalAmount: 41670,
          organization: { id: 1, name: 'NoReason - centrála' },
          items: [],
        });
      }

      if (pathname === '/api/organizations' && method === 'GET') {
        return respond(request, {
          data: [
            { id: 1, name: 'NoReason - centrála', code: 'NRCEN', hourlyRate: 550, kilometerRate: 10, services: [] },
            { id: 2, name: 'Oresi - Březí', code: 'O35', hourlyRate: 600, kilometerRate: 12, services: [] },
          ],
        });
      }

      if (pathname === '/api/work-records' && method === 'GET') {
        return respond(request, {
          data: [
            {
              id: 1,
              organizationId: 1,
              billingOrgId: null,
              userId: MOCK_USER.id,
              date: new Date('2025-07-01T08:00:00Z').toISOString(),
              worker: 'Eva Testerová',
              description: 'On-site support',
              minutes: 150,
              timeFrom: '08:00',
              timeTo: '10:30',
              branch: 'Praha',
              kilometers: 42,
              status: 'APPROVED',
              month: 7,
              year: 2025,
              organization: {
                id: 1,
                name: 'NoReason - centrála',
                hourlyRateCents: 55000,
                kilometerRateCents: 1000,
              },
              billingOrg: null,
              user: { id: MOCK_USER.id, email: MOCK_USER.email, name: MOCK_USER.name },
            },
          ],
          pagination: { page: 1, limit: 50, total: 1, pages: 1 },
        });
      }

      if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        return respond(request, { success: true });
      }

      return respond(request, {});
    }

    request.continue();
  });
}

async function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR);
  }
}

async function run() {
  await ensureScreenshotDir();

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 50,
    args: ['--window-size=1440,900', '--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await installApiMocks(page);

  const takeScreenshot = async (name) => {
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });
    console.log(`📸 Screenshot: ${name}`);
  };

  try {
    console.log('🚀 Spouštím smoke scénář Fakturace (mockovaný backend)\n');

    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await takeScreenshot('01-login');

    await page.type('input[type="email"]', MOCK_USER.email);
    await page.type('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    await takeScreenshot('02-dashboard');

    await page.click('a[href="/organizations"]');
    await page.waitForSelector('text=Oresi - Březí');
    await takeScreenshot('03-organizations');

    await page.click('a[href="/work-records"]');
    await page.waitForSelector('text=Eva Testerová');
    await takeScreenshot('04-work-records');

    await page.click('a[href="/invoices"]');
    await page.waitForSelector('text=2025-0001');
    await takeScreenshot('05-invoices');

    console.log('\n✅ Smoke scénář úspěšně proběhl.');
  } catch (error) {
    console.error('\n❌ Smoke scénář selhal:', error);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
