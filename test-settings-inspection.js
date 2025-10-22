const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('=== PŘIHLÁŠENÍ ===');
  await page.goto('http://localhost:3030/login', { waitUntil: 'networkidle', timeout: 30000 });

  // Přihlášení
  await page.screenshot({ path: '/home/noreason/project/fakturace/login-page.png' });
  console.log('Screenshot login stránky uložen');

  await page.fill('input[placeholder="admin@fakturace.cz"]', 'admin@fakturace.cz');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');

  try {
    await page.waitForURL(/dashboard/, { timeout: 10000 });
    console.log('Přihlášen jako admin');
  } catch (e) {
    console.log('Přihlášení selhalo, zachytávám aktuální stav...');
    await page.screenshot({ path: '/home/noreason/project/fakturace/after-login-attempt.png' });
    console.log('URL po pokusu o přihlášení:', page.url());
  }

  console.log('\n=== NAVIGACE NA SETTINGS ===');
  await page.goto('http://localhost:3030/settings', { waitUntil: 'networkidle', timeout: 30000 });

  console.log('\n=== STAV STRÁNKY ===');
  console.log('URL:', page.url());
  console.log('Titulek:', await page.title());

  // Všechny viditelné tlačítka
  console.log('\n=== TLAČÍTKA ===');
  const buttons = await page.locator('button').all();
  for (let i = 0; i < buttons.length; i++) {
    const text = await buttons[i].textContent();
    const visible = await buttons[i].isVisible();
    const enabled = await buttons[i].isEnabled();
    console.log(`${i+1}. "${text?.trim()}" - Viditelné: ${visible}, Aktivní: ${enabled}`);
  }

  // Všechny odkazy/linky
  console.log('\n=== NAVIGAČNÍ ODKAZY ===');
  const links = await page.locator('a').all();
  for (let i = 0; i < links.length; i++) {
    const text = await links[i].textContent();
    const href = await links[i].getAttribute('href');
    const visible = await links[i].isVisible();
    if (visible && text?.trim()) {
      console.log(`${i+1}. "${text.trim()}" -> ${href}`);
    }
  }

  // Inputy
  console.log('\n=== INPUT POLE ===');
  const inputs = await page.locator('input').all();
  for (let i = 0; i < inputs.length; i++) {
    const type = await inputs[i].getAttribute('type');
    const placeholder = await inputs[i].getAttribute('placeholder');
    const visible = await inputs[i].isVisible();
    if (visible) {
      console.log(`${i+1}. Type: ${type}, Placeholder: "${placeholder}"`);
    }
  }

  // Záložky/Tabs
  console.log('\n=== ZÁLOŽKY/TABS ===');
  const tabs = await page.locator('[role="tab"]').all();
  for (let i = 0; i < tabs.length; i++) {
    const text = await tabs[i].textContent();
    const selected = await tabs[i].getAttribute('aria-selected');
    console.log(`${i+1}. "${text?.trim()}" - Aktivní: ${selected === 'true'}`);
  }

  // Screenshot
  await page.screenshot({ path: '/home/noreason/project/fakturace/settings-page.png', fullPage: true });
  console.log('\n=== SCREENSHOT ===');
  console.log('Uložen jako: settings-page.png');

  await browser.close();
  console.log('\n=== HOTOVO ===');
})();
