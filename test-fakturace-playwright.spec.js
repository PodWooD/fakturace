/**
 * Playwright E2E test for Fakturace system
 * The tests mock backend API responses so that they can run without
 * a real database or background services.
 *
 * Run with: npx playwright test --headed --project=chromium
 */

const { test, expect } = require('@playwright/test');

const MOCK_USER = {
  id: 1,
  email: 'admin@fakturace.cz',
  name: 'Administrator',
  role: 'ADMIN',
};

const respondJson = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

async function installApiMocks(page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;
    const method = route.request().method();

    if (pathname === '/api/auth/login' && method === 'POST') {
      return respondJson(route, { token: 'mock-token', user: MOCK_USER });
    }

    if (pathname === '/api/auth/verify' && method === 'GET') {
      return respondJson(route, { user: MOCK_USER });
    }

    if (pathname.startsWith('/api/work-records/available-months')) {
      return respondJson(route, [
        { month: 7, year: 2025, recordsCount: 2, label: 'červenec 2025', monthName: 'červenec' },
      ]);
    }

    if (pathname.startsWith('/api/work-records/summary/')) {
      return respondJson(route, [
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
      return respondJson(route, {
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
      return respondJson(route, {
        id: 1,
        invoiceNumber: '2025-0001',
        status: 'DRAFT',
        totalAmount: 41670,
        organization: { id: 1, name: 'NoReason - centrála' },
        items: [],
      });
    }

    if (pathname === '/api/organizations' && method === 'GET') {
      return respondJson(route, {
        data: [
          {
            id: 1,
            name: 'NoReason - centrála',
            code: 'NRCEN',
            hourlyRate: 550,
            kilometerRate: 10,
            services: [],
          },
          {
            id: 2,
            name: 'Oresi - Březí',
            code: 'O35',
            hourlyRate: 600,
            kilometerRate: 12,
            services: [],
          },
        ],
      });
    }

    if (pathname === '/api/work-records' && method === 'GET') {
      return respondJson(route, {
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

    if (pathname.startsWith('/api/organizations') && method !== 'GET') {
      return respondJson(route, { id: 99, success: true }, 201);
    }

    if (pathname === '/api/received-invoices' && method === 'GET') {
      return respondJson(route, []);
    }

    if (pathname.startsWith('/api/billing') && method === 'GET') {
      return respondJson(route, { data: [] });
    }

    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
      return respondJson(route, { success: true });
    }

    return respondJson(route, {});
  });
}

async function login(page) {
  await page.fill('input[type="email"]', 'admin@fakturace.cz');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/dashboard/);
}

test.describe('Fakturace - Mocked E2E smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    await installApiMocks(page);
    await page.goto('http://localhost:3030');
  });

  test('Dashboard overview and navigation flow', async ({ page }) => {
    await login(page);

    await expect(page.getByRole('heading', { name: 'Měsíční přehled organizací' })).toBeVisible();
    await expect(page.getByText('NoReason - centrála', { exact: false })).toBeVisible();

    await page.click('a[href="/organizations"]');
    await expect(page).toHaveURL(/organizations/);
    await expect(page.getByText('Oresi - Březí')).toBeVisible();

    await page.click('a[href="/work-records"]');
    await expect(page).toHaveURL(/work-records/);
    await expect(page.getByText('Eva Testerová')).toBeVisible();

    await page.click('a[href="/invoices"]');
    await expect(page).toHaveURL(/invoices/);
    await expect(page.getByText('2025-0001')).toBeVisible();

    await page.click('a[href="/dashboard"]');
    await expect(page).toHaveURL(/dashboard/);
  });

  test('Organizations modal opens and pre-fills defaults', async ({ page }) => {
    await login(page);

    await page.click('a[href="/organizations"]');
    await page.getByRole('button', { name: /přidat organizaci/i }).click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel('Název organizace')).toBeVisible();

    // Close modal again
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  });

  test('Main navigation links render without errors', async ({ page }) => {
    await login(page);

    const menuLinks = [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Organizace', href: '/organizations' },
      { label: 'Výkazy práce', href: '/work-records' },
      { label: 'Faktury', href: '/invoices' },
      { label: 'Import dat', href: '/import' },
      { label: 'Export', href: '/export' },
      { label: 'Reporty', href: '/reports' },
    ];

    for (const { href } of menuLinks) {
      await page.click(`a[href="${href}"]`);
      await expect(page).toHaveURL(new RegExp(href));
      await expect(page.locator('text=/500|Chyba/')).not.toBeVisible();
    }
  });
});
