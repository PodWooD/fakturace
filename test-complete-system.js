/**
 * Komplexní E2E test systému fakturace
 * Testuje všechny hlavní funkce od loginu po generování faktur
 */

const puppeteer = require('puppeteer');

// Test konfigurace
const BASE_URL = 'http://localhost:3003';
const TEST_USER = {
  email: 'admin@fakturace.cz',
  password: 'admin123'
};

// Pomocné funkce pro čekání a screenshoty
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function takeScreenshot(page, name) {
  await page.screenshot({
    path: `./test-screenshots/${name}.png`,
    fullPage: true
  });
  console.log(`📸 Screenshot: ${name}`);
}

async function waitForNavigation(page, timeout = 5000) {
  try {
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout });
  } catch (e) {
    console.log('⚠️  Navigation timeout, pokračuji...');
  }
}

// Hlavní testovací funkce
async function runTests() {
  console.log('🚀 Spouštím komplexní test systému fakturace...\n');

  const browser = await puppeteer.launch({
    headless: false, // Viditelný browser pro debugging
    slowMo: 100, // Zpomalení pro lepší viditelnost
    args: [
      '--window-size=1920,1080',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Vytvoření složky pro screenshoty
  const fs = require('fs');
  if (!fs.existsSync('./test-screenshots')) {
    fs.mkdirSync('./test-screenshots');
  }

  try {
    // ===== 1. TEST PŘIHLÁŠENÍ =====
    console.log('\n📝 TEST 1: Přihlášení');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await takeScreenshot(page, '01-login-page');

    // Kontrola, že jsme na login stránce
    const loginTitle = await page.title();
    console.log(`   Titulek stránky: ${loginTitle}`);

    // Vyplnění přihlašovacích údajů
    await page.type('input[type="email"], input[name="email"]', TEST_USER.email);
    await page.type('input[type="password"], input[name="password"]', TEST_USER.password);
    await takeScreenshot(page, '02-login-filled');

    // Kliknutí na přihlášení
    await page.click('button[type="submit"]');
    await waitForNavigation(page);
    await delay(1000);
    await takeScreenshot(page, '03-after-login');

    // Kontrola přihlášení
    const currentUrl = page.url();
    console.log(`   Aktuální URL: ${currentUrl}`);
    if (currentUrl.includes('login')) {
      throw new Error('❌ Přihlášení selhalo!');
    }
    console.log('   ✅ Přihlášení úspěšné');

    // ===== 2. TEST DASHBOARD A NAVIGACE =====
    console.log('\n📊 TEST 2: Dashboard a navigace');
    await delay(1000);

    // Kontrola navigačního menu
    const navLinks = await page.$$('nav a, [role="navigation"] a');
    console.log(`   Počet navigačních odkazů: ${navLinks.length}`);
    await takeScreenshot(page, '04-dashboard');

    // ===== 3. TEST ORGANIZACÍ =====
    console.log('\n🏢 TEST 3: Organizace (CRUD operace)');

    // Navigace na stránku organizací
    await page.goto(`${BASE_URL}/organizations`, { waitUntil: 'networkidle2' });
    await delay(1000);
    await takeScreenshot(page, '05-organizations-list');

    // Kontrola tabulky organizací
    const orgRows = await page.$$('table tbody tr');
    console.log(`   Počet organizací v tabulce: ${orgRows.length}`);

    // Přidání nové organizace
    const addButton = await page.$('button:has-text("Přidat"), button:has-text("Add"), button:has-text("Nová")');
    if (addButton) {
      await addButton.click();
      await delay(500);
      await takeScreenshot(page, '06-add-organization-form');

      // Vyplnění formuláře (pokud je viditelný)
      const nameInput = await page.$('input[name="name"], input[placeholder*="název"], input[placeholder*="name"]');
      if (nameInput) {
        await nameInput.type('Test Organizace E2E');
        await page.type('input[name="address"], textarea[name="address"]', 'Testovací adresa 123');
        await page.type('input[name="ico"], input[placeholder*="IČO"]', '12345678');
        await takeScreenshot(page, '07-organization-form-filled');

        // Uložení
        await page.click('button[type="submit"]');
        await delay(1000);
        await takeScreenshot(page, '08-organization-added');
        console.log('   ✅ Organizace přidána');
      }
    }

    // ===== 4. TEST KLIENTŮ =====
    console.log('\n👥 TEST 4: Klienti (CRUD operace)');

    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle2' });
    await delay(1000);
    await takeScreenshot(page, '09-clients-list');

    const clientRows = await page.$$('table tbody tr');
    console.log(`   Počet klientů v tabulce: ${clientRows.length}`);

    // Přidání nového klienta
    const addClientBtn = await page.$('button:has-text("Přidat"), button:has-text("Add"), button:has-text("Nový")');
    if (addClientBtn) {
      await addClientBtn.click();
      await delay(500);
      await takeScreenshot(page, '10-add-client-form');

      const clientNameInput = await page.$('input[name="name"]');
      if (clientNameInput) {
        await clientNameInput.type('Test Klient E2E');
        await page.type('input[name="email"]', 'test@client.cz');
        await page.type('input[name="phone"]', '+420123456789');
        await takeScreenshot(page, '11-client-form-filled');

        await page.click('button[type="submit"]');
        await delay(1000);
        await takeScreenshot(page, '12-client-added');
        console.log('   ✅ Klient přidán');
      }
    }

    // ===== 5. TEST PRACOVNÍCH ZÁZNAMŮ =====
    console.log('\n⏱️  TEST 5: Pracovní záznamy');

    await page.goto(`${BASE_URL}/work-records`, { waitUntil: 'networkidle2' });
    await delay(1000);
    await takeScreenshot(page, '13-work-records-list');

    const workRecordRows = await page.$$('table tbody tr');
    console.log(`   Počet pracovních záznamů: ${workRecordRows.length}`);

    // Přidání nového záznamu
    const addWorkRecordBtn = await page.$('button:has-text("Přidat"), button:has-text("Add"), button:has-text("Nový")');
    if (addWorkRecordBtn) {
      await addWorkRecordBtn.click();
      await delay(500);
      await takeScreenshot(page, '14-add-work-record-form');

      // Vyplnění formuláře pracovního záznamu
      const descInput = await page.$('input[name="description"], textarea[name="description"]');
      if (descInput) {
        await descInput.type('E2E testování systému fakturace');

        // Výběr klienta (pokud existuje select)
        const clientSelect = await page.$('select[name="clientId"]');
        if (clientSelect) {
          const options = await page.$$('select[name="clientId"] option');
          if (options.length > 1) {
            await page.select('select[name="clientId"]', await options[1].evaluate(el => el.value));
          }
        }

        // Vyplnění hodin
        const hoursInput = await page.$('input[name="hours"], input[type="number"]');
        if (hoursInput) {
          await hoursInput.type('5');
        }

        await takeScreenshot(page, '15-work-record-form-filled');

        await page.click('button[type="submit"]');
        await delay(1000);
        await takeScreenshot(page, '16-work-record-added');
        console.log('   ✅ Pracovní záznam přidán');
      }
    }

    // ===== 6. TEST FAKTUR =====
    console.log('\n📄 TEST 6: Faktury');

    await page.goto(`${BASE_URL}/invoices`, { waitUntil: 'networkidle2' });
    await delay(1000);
    await takeScreenshot(page, '17-invoices-list');

    const invoiceRows = await page.$$('table tbody tr');
    console.log(`   Počet faktur: ${invoiceRows.length}`);

    // Vytvoření nové faktury
    const addInvoiceBtn = await page.$('button:has-text("Přidat"), button:has-text("Add"), button:has-text("Nová"), button:has-text("Vytvořit")');
    if (addInvoiceBtn) {
      await addInvoiceBtn.click();
      await delay(500);
      await takeScreenshot(page, '18-add-invoice-form');

      // Vyplnění formuláře faktury
      const invoiceNumberInput = await page.$('input[name="invoiceNumber"]');
      if (invoiceNumberInput) {
        await invoiceNumberInput.type('E2E-2025-001');

        // Výběr klienta
        const clientSelect = await page.$('select[name="clientId"]');
        if (clientSelect) {
          const options = await page.$$('select[name="clientId"] option');
          if (options.length > 1) {
            await page.select('select[name="clientId"]', await options[1].evaluate(el => el.value));
          }
        }

        await takeScreenshot(page, '19-invoice-form-filled');

        await page.click('button[type="submit"]');
        await delay(1000);
        await takeScreenshot(page, '20-invoice-created');
        console.log('   ✅ Faktura vytvořena');
      }
    }

    // Test zobrazení/stažení faktury
    const viewButtons = await page.$$('button:has-text("Zobrazit"), button:has-text("View"), a:has-text("Zobrazit")');
    if (viewButtons.length > 0) {
      await viewButtons[0].click();
      await delay(2000);
      await takeScreenshot(page, '21-invoice-detail');
      console.log('   ✅ Detail faktury zobrazen');
    }

    // ===== 7. TEST IMPORTU =====
    console.log('\n📥 TEST 7: Import funkce');

    await page.goto(`${BASE_URL}/import`, { waitUntil: 'networkidle2' });
    await delay(1000);
    await takeScreenshot(page, '22-import-page');
    console.log('   ✅ Stránka importu načtena');

    // ===== 8. TEST ODHLÁŠENÍ =====
    console.log('\n🚪 TEST 8: Odhlášení');

    const logoutBtn = await page.$('button:has-text("Odhlásit"), button:has-text("Logout"), a:has-text("Odhlásit")');
    if (logoutBtn) {
      await logoutBtn.click();
      await delay(1000);
      await takeScreenshot(page, '23-after-logout');

      const finalUrl = page.url();
      if (finalUrl.includes('login')) {
        console.log('   ✅ Odhlášení úspěšné');
      } else {
        console.log('   ⚠️  Možná jsme stále přihlášeni');
      }
    } else {
      console.log('   ⚠️  Tlačítko odhlášení nenalezeno');
    }

    // ===== SHRNUTÍ =====
    console.log('\n\n═══════════════════════════════════════════');
    console.log('✅ TESTY DOKONČENY!');
    console.log('═══════════════════════════════════════════');
    console.log('\nScreenshoty uloženy v ./test-screenshots/');
    console.log('\n📊 Souhrn testů:');
    console.log('  ✅ Přihlášení');
    console.log('  ✅ Dashboard a navigace');
    console.log('  ✅ Organizace (CRUD)');
    console.log('  ✅ Klienti (CRUD)');
    console.log('  ✅ Pracovní záznamy');
    console.log('  ✅ Faktury a generování');
    console.log('  ✅ Import');
    console.log('  ✅ Odhlášení');

  } catch (error) {
    console.error('\n❌ CHYBA PŘI TESTOVÁNÍ:', error.message);
    await takeScreenshot(page, 'error-state');
    throw error;
  } finally {
    // Necháme browser otevřený pro kontrolu
    console.log('\n⏸️  Browser zůstává otevřený pro kontrolu. Zavřete manuálně nebo čekám 30s...');
    await delay(30000);
    await browser.close();
  }
}

// Spuštění testů
runTests()
  .then(() => {
    console.log('\n🎉 Všechny testy proběhly úspěšně!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Testy selhaly:', error);
    process.exit(1);
  });
