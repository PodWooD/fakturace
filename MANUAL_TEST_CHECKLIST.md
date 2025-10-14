# ✅ Manuální testovací checklist - Systém Fakturace

**URL aplikace:** http://localhost:3003
**Testovací účet:** admin@fakturace.cz / admin123

---

## 🔐 Test 1: Přihlášení

- [ ] Otevři http://localhost:3003
- [ ] Zobrazí se zelená přihlašovací stránka "Fakturační Systém"
- [ ] Pole Email a Heslo jsou viditelné
- [ ] Testovací přihlašovací údaje jsou zobrazeny
- [ ] Vyplň email: `admin@fakturace.cz`
- [ ] Vyplň heslo: `admin123`
- [ ] Klikni na "Přihlásit se"
- [ ] **Očekávaný výsledek:** Přesměrování na /dashboard

---

## 📊 Test 2: Dashboard

### Navigace
- [ ] Zelený header s "📊 Fakturační Systém"
- [ ] Navigační odkazy v headeru:
  - [ ] Dashboard
  - [ ] Organizace
  - [ ] Výkazy práce
  - [ ] Faktury
  - [ ] Import dat
  - [ ] Export
  - [ ] Reporty
- [ ] Zobrazení jména uživatele vpravo nahoře: "Administrator"
- [ ] Tlačítko "Odhlásit"

### Statistické karty
- [ ] Karta "AKTIVNÍ ORGANIZACE" - zobrazuje číslo
- [ ] Karta "ZBÝVÁ VYFAKTUROVAT" - zobrazuje číslo (oranžová)
- [ ] Karta "TENTO MĚSÍC" - zobrazuje částku v Kč (modrá)
- [ ] Karta "ODPRACOVÁNO" - zobrazuje hodiny (červená)

### Rychlé akce
- [ ] Tlačítko "📊 Import dat z Excelu" (zelené)
- [ ] Tlačítko "Vygenerovat faktury" (modré)
- [ ] Tlačítko "Export do Pohoda XML" (oranžové)
- [ ] Tlačítko "Měsíční report" (outline)

### Upozornění sekce
- [ ] Žlutá box s "⚠️ UPOZORNĚNÍ"
- [ ] Informace o organizacích bez faktur
- [ ] Připomínka importu dat
- [ ] Informace o ujetých km

### Tabulka organizací
- [ ] Tabulka "MĚSÍČNÍ PŘEHLED ORGANIZACÍ"
- [ ] Sloupce: Organizace, Počet záznamů, Hodiny, Km, Za hodiny, Za km, Celkem, Stav faktury
- [ ] Zobrazení alespoň jedné organizace (např. "Lázně Toušeň")
- [ ] Řádek "CELKEM" s sumou

### Roční statistiky
- [ ] Sekce "ROČNÍ STATISTIKY 2025"
- [ ] 4 statistické boxíky s čísly

---

## 🏢 Test 3: Organizace

### Základní zobrazení
- [ ] Klikni na "🏢 Organizace" v navigaci
- [ ] **URL:** http://localhost:3003/organizations
- [ ] Tabulka se zobrazí
- [ ] Viditelné sloupce: Název, Kód, IČO, DIČ, Adresa, Email, Telefon, Akce

### CRUD operace
- [ ] Tlačítko "Přidat organizaci" je viditelné
- [ ] Klikni na "Přidat organizaci"
- [ ] Zobrazí se formulář s poli:
  - [ ] Název organizace *
  - [ ] Kód organizace *
  - [ ] IČO
  - [ ] DIČ
  - [ ] Adresa
  - [ ] Email
  - [ ] Telefon
  - [ ] Hodinová sazba
  - [ ] Sazba za km

### Test přidání organizace
- [ ] Vyplň název: "Test Organizace 2025"
- [ ] Vyplň kód: "TEST2025"
- [ ] Vyplň IČO: "12345678"
- [ ] Klikni "Uložit"
- [ ] **Očekávaný výsledek:** Organizace se přidá do seznamu

### Test editace
- [ ] U existující organizace klikni na "Upravit"
- [ ] Formulář se předvyplní daty
- [ ] Uprav název
- [ ] Klikni "Uložit"
- [ ] **Očekávaný výsledek:** Změny se uloží

### Test smazání
- [ ] U organizace klikni na "Smazat"
- [ ] Zobrazí se potvrzovací dialog
- [ ] Klikni "Ano"
- [ ] **Očekávaný výsledek:** Organizace zmizí ze seznamu

---

## ⏱️ Test 4: Výkazy práce (Work Records)

### Základní zobrazení
- [ ] Klikni na "⏱️ Výkazy práce"
- [ ] **URL:** http://localhost:3003/work-records
- [ ] Tabulka s výkazy se zobrazí
- [ ] Sloupce: Datum, Pracovník, Organizace, Pobočka, Popis, Čas, Hodiny, Kilometry, Akce

### Test přidání záznamu
- [ ] Klikni "Přidat záznam"
- [ ] Formulář obsahuje:
  - [ ] Datum *
  - [ ] Pracovník *
  - [ ] Organizace * (dropdown)
  - [ ] Pobočka (dropdown)
  - [ ] Popis práce *
  - [ ] Čas začátku
  - [ ] Čas konce / nebo Minuty
  - [ ] Kilometry
- [ ] Vyplň všechna povinná pole
- [ ] Klikni "Uložit"
- [ ] **Očekávaný výsledek:** Záznam se přidá

### Test filtrace
- [ ] Dropdown pro výběr měsíce
- [ ] Dropdown pro výběr organizace
- [ ] Filtry fungují a aktualizují tabulku

---

## 📄 Test 5: Faktury

### Základní zobrazení
- [ ] Klikni na "📄 Faktury"
- [ ] **URL:** http://localhost:3003/invoices
- [ ] Tabulka faktur se zobrazí
- [ ] Sloupce: Číslo faktury, Organizace, Měsíc/Rok, Částka, Stav, Vytvořeno, Akce

### Test vytvoření faktury
- [ ] Klikni "Vytvořit fakturu" nebo "+ Nová faktura"
- [ ] **URL:** http://localhost:3003/invoices/new
- [ ] Formulář obsahuje:
  - [ ] Výběr organizace *
  - [ ] Výběr měsíce *
  - [ ] Výběr roku *
- [ ] Vyber organizaci
- [ ] Vyber měsíc a rok
- [ ] Klikni "Zobrazit náhled"
- [ ] **Očekávaný výsledek:** Zobrazí se náhled faktury s:
  - [ ] Údaji organizace
  - [ ] Tabulkou výkazů práce
  - [ ] Souhrnem částek
  - [ ] Tlačítkem "Vytvořit fakturu"

### Test zobrazení faktury
- [ ] V seznamu faktur klikni na "Zobrazit" u faktury
- [ ] **URL:** http://localhost:3003/invoices/[id]
- [ ] Zobrazí se detail faktury:
  - [ ] Číslo faktury
  - [ ] Údaje dodavatele
  - [ ] Údaje odběratele
  - [ ] Tabulka položek
  - [ ] Souhrn (bez DPH, DPH 21%, s DPH)
  - [ ] Tlačítka: Stáhnout PDF, Export do Pohoda, Upravit stav

---

## 📥 Test 6: Import dat

### Základní zobrazení
- [ ] Klikni na "📥 Import dat"
- [ ] **URL:** http://localhost:3003/import
- [ ] Stránka obsahuje:
  - [ ] Informační box s instrukcemi
  - [ ] Input pro výběr souboru
  - [ ] Tlačítko "Importovat"

### Test importu
- [ ] Připrav Excel soubor s výkazy
- [ ] Klikni "Vybrat soubor"
- [ ] Vyber Excel soubor
- [ ] Klikni "Importovat"
- [ ] **Očekávaný výsledek:**
  - [ ] Zobrazí se progress bar
  - [ ] Po dokončení zpráva o úspěchu
  - [ ] Počet importovaných záznamů

---

## 📤 Test 7: Export

### Základní zobrazení
- [ ] Klikni na "📤 Export"
- [ ] **URL:** http://localhost:3003/export
- [ ] Stránka obsahuje:
  - [ ] Filtr měsíce a roku
  - [ ] Tabulku faktur k exportu
  - [ ] Checkboxy pro výběr faktur
  - [ ] Tlačítka "Exportovat vybrané" a "Exportovat jednotlivě"

### Test exportu
- [ ] Vyber měsíc a rok
- [ ] Zaškrtni checkbox u alespoň jedné faktury
- [ ] Klikni "Exportovat vybrané"
- [ ] **Očekávaný výsledek:**
  - [ ] Stáhne se XML soubor
  - [ ] Název souboru: pohoda-export-YYYY-MM.xml

---

## 📈 Test 8: Reporty

### Základní zobrazení
- [ ] Klikni na "📈 Reporty"
- [ ] **URL:** http://localhost:3003/reports
- [ ] Stránka obsahuje:
  - [ ] Nadpis "Měsíční report - [měsíc rok]"
  - [ ] Filtry měsíce a roku
  - [ ] Tlačítka: Tisk, Export CSV, Dashboard

### Statistiky
- [ ] 4 statistické karty:
  - [ ] CELKEM ORGANIZACÍ
  - [ ] POČET ZÁZNAMŮ
  - [ ] ODPRACOVANÉ HODINY
  - [ ] UJETÉ KILOMETRY

### Finanční přehled
- [ ] Box "Finanční přehled" s:
  - [ ] Celková částka k fakturaci
  - [ ] Již vyfakturováno (zelená)
  - [ ] Zbývá vyfakturovat (oranžová)

### Detailní tabulka
- [ ] Tabulka organizací s detaily
- [ ] Řádek CELKEM s sumami

### Test tisku
- [ ] Klikni "🖨️ Tisk"
- [ ] **Očekávaný výsledek:** Otevře se print dialog

### Test CSV exportu
- [ ] Klikni "📊 Export CSV"
- [ ] **Očekávaný výsledek:** Stáhne se CSV soubor

---

## 🚪 Test 9: Odhlášení

- [ ] Klikni na "Odhlásit" vpravo nahoře
- [ ] **Očekávaný výsledek:**
  - [ ] Přesměrování na /login
  - [ ] Session cleared
  - [ ] Při pokusu o přístup na /dashboard redirect na login

---

## 📱 Test 10: Responsivní design

### Desktop (1920x1080)
- [ ] Všechny elementy správně zobrazeny
- [ ] Tabulky mají dostatek místa
- [ ] Navigace v headeru

### Tablet (768x1024)
- [ ] Layout se přizpůsobí
- [ ] Tabulky scrollovatelné
- [ ] Tlačítka dostupná

### Mobile (375x667)
- [ ] Hamburger menu se zobrazí
- [ ] Navigace v mobile menu
- [ ] Tabulky horizontálně scrollovatelné
- [ ] Formuláře full-width

---

## 🎨 Test 11: Design a UX

### Barevné schéma
- [ ] Zelený primary color (#4CAF50)
- [ ] Modrá pro info (#2196F3)
- [ ] Oranžová pro warning (#FF9800)
- [ ] Červená pro danger (#F44336)
- [ ] Bílé pozadí formulářů
- [ ] Šedé pozadí aplikace (#f5f5f5)

### Typografie
- [ ] Čitelné fonty
- [ ] Konzistentní velikosti
- [ ] Dostatečný kontrast

### Ikony a emojis
- [ ] Emoji ikony v navigaci (📊, 🏢, ⏱️, atd.)
- [ ] Konzistentní použití
- [ ] Správné významy

---

## ⚡ Test 12: Performance

- [ ] Stránky se načítají rychle (< 2s)
- [ ] Tabulky renderují plynule
- [ ] Formuláře reagují okamžitě
- [ ] Navigace mezi stránkami je rychlá
- [ ] Žádné zamrznutí UI

---

## 🔒 Test 13: Bezpečnost

- [ ] Bez přihlášení redirect na /login
- [ ] Po odhlášení nelze přistoupit k chráněným stránkám
- [ ] API volání obsahují Authorization header
- [ ] Chybové zprávy neodhalují citlivé info

---

## 🐛 Test 14: Error handling

### Síťové chyby
- [ ] Vypni backend server
- [ ] Zkus přihlášení
- [ ] **Očekávaný výsledek:** Zobrazí se chybová zpráva

### Validace formulářů
- [ ] Zkus odeslat prázdný formulář
- [ ] **Očekávaný výsledek:** Validační chyby

### 404 stránky
- [ ] Jdi na http://localhost:3003/neexistujici-stranka
- [ ] **Očekávaný výsledek:** 404 stránka nebo redirect

---

## ✅ Výsledné hodnocení

**Celkem testů:** 100+

**Proběhlé testy:** _____ / 100+

**Nalezené chyby:** _____

**Kritické chyby:** _____

**Poznámky:**
```
[Zde zapiš zjištění, chyby nebo návrhy na vylepšení]
```

---

**Datum testování:** _________________

**Testoval:** _________________

**Verze aplikace:** v1.0.0

**Prohlížeč:** _________________

**OS:** _________________
