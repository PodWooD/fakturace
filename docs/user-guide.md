# Uživatelská příručka - Fakturační Systém

## 📋 Obsah

1. [Úvod](#úvod)
2. [První přihlášení](#první-přihlášení)
3. [Dashboard](#dashboard)
4. [Správa organizací](#správa-organizací)
5. [Import dat z Excelu](#import-dat-z-excelu)
6. [Pracovní výkazy](#pracovní-výkazy)
7. [Generování faktur](#generování-faktur)
8. [Export do Pohody](#export-do-pohody)
9. [Reporty a statistiky](#reporty-a-statistiky)
10. [Tipy a triky](#tipy-a-triky)

## 🎯 Úvod

Fakturační systém je navržen pro snadnou správu a automatizaci fakturace IT služeb. Tato příručka vás provede všemi funkcemi systému krok za krokem.

### Hlavní výhody
- 🚀 **Úspora času** - Automatizace rutinních úkonů
- 📊 **Přehlednost** - Všechna data na jednom místě
- ✅ **Jednoduchost** - Intuitivní ovládání
- 🔄 **Integrace** - Napojení na účetní systém Pohoda

## 🔐 První přihlášení

### 1. Otevření aplikace
Otevřete webový prohlížeč a zadejte adresu:
```
http://localhost:3030
```
nebo adresu vašeho serveru.

### 2. Přihlašovací údaje
Použijte výchozí přihlašovací údaje:
- **Email:** admin@fakturace.cz
- **Heslo:** admin123

### 3. Změna hesla
**DŮLEŽITÉ:** Po prvním přihlášení ihned změňte heslo!
1. Klikněte na vaše jméno v pravém horním rohu
2. Vyberte "Nastavení profilu"
3. Změňte heslo na silné a unikátní

## 📊 Dashboard

Dashboard je hlavní obrazovka systému, která poskytuje rychlý přehled.

### Statistické karty
![Dashboard Stats](dashboard-stats.png)

- **Aktivní organizace** - Počet organizací v systému
- **Pracovní záznamy** - Celkový počet záznamů za měsíc
- **Vygenerované faktury** - Počet faktur za měsíc
- **Celková částka** - Součet všech faktur

### Rychlé akce
- **Import výkazů** - Nahrání Excel souboru s daty
- **Generovat faktury** - Hromadné generování faktur
- **Export do Pohody** - Export faktur do XML
- **Měsíční report** - Přehled za měsíc

### Tabulka organizací
Zobrazuje přehled všech organizací s:
- Počtem hodin za měsíc
- Celkovou částkou
- Stavem faktury

## 🏢 Správa organizací

### Přidání nové organizace

1. V menu vyberte **"Organizace"**
2. Klikněte na tlačítko **"Přidat organizaci"**
3. Vyplňte formulář:
   - **Název** - Oficiální název firmy
   - **Kód** - Zkratka (např. LT pro Lázně Toušeň)
   - **Hodinová sazba** - Cena za hodinu práce
   - **Sazba za km** - Cena za kilometr
   - **Kontaktní osoba** - Jméno kontaktu
   - **Email** - Kontaktní email
   - **IČO/DIČ** - Identifikační údaje
4. Klikněte **"Uložit"**

### Úprava organizace

1. V seznamu organizací klikněte na název
2. Upravte potřebné údaje
3. Klikněte **"Uložit změny"**

### Nastavení paušálních služeb

1. Otevřete detail organizace
2. V sekci **"Paušální služby"** klikněte **"Přidat službu"**
3. Vyplňte:
   - **Název služby** - např. "Správa IT"
   - **Popis** - Detailní popis služby
   - **Měsíční cena** - Paušální částka
4. Služba se automaticky přidá do každé faktury

## 📥 Import dat z Excelu

### Příprava Excel souboru

Systém očekává Excel soubor s následující strukturou:

| Sloupec | Obsah | Příklad |
|---------|-------|---------|
| B | Pracovník | Jan Novák |
| C | Datum | 14.7.2025 |
| G | Počet hodin | 8:30 |
| H | Popis práce | Instalace serveru |
| I | Společnost | LT - Lázně Toušeň |
| K | Kilometry | 120 |

### Proces importu

1. V menu vyberte **"Import"** nebo na dashboardu **"Import výkazů"**
2. Vyberte měsíc a rok
3. Klikněte na oblast pro nahrání nebo přetáhněte Excel soubor
4. Systém zobrazí náhled dat
5. Zkontrolujte mapování organizací
6. Klikněte **"Importovat"**

### Řešení problémů při importu

**Neznámá organizace:**
- Systém vytvoří novou organizaci
- Po importu doplňte chybějící údaje (IČO, sazby)

**Chybný formát data:**
- Používejte formát DD.MM.YYYY
- Nebo nastavte v Excelu formát buněk na "Datum"

**Neplatné hodiny:**
- Používejte formát H:MM (např. 8:30)
- Nebo desetinné číslo (např. 8.5)

## 💼 Pracovní výkazy

### Zobrazení výkazů

1. V menu vyberte **"Pracovní výkazy"**
2. Nastavte filtry:
   - Měsíc a rok
   - Organizace
   - Pracovník
3. Tabulka zobrazí filtrované záznamy

### Ruční přidání záznamu

1. Klikněte **"Přidat záznam"**
2. Vyplňte formulář:
   - **Organizace** - Vyberte ze seznamu
   - **Datum** - Datum práce
   - **Pracovník** - Jméno technika
   - **Popis** - Co bylo provedeno
   - **Hodiny** - Odpracovaný čas
   - **Kilometry** - Ujeté km
3. Klikněte **"Uložit"**

### Úprava záznamu

1. Klikněte na ikonu tužky u záznamu
2. Upravte potřebné údaje
3. Klikněte **"Uložit změny"**

### Hromadné operace

1. Zaškrtněte záznamy pomocí checkboxů
2. Vyberte akci:
   - **Smazat** - Odstranění vybraných
   - **Změnit organizaci** - Přesun k jiné organizaci
   - **Export** - Stažení do Excelu

## 📄 Generování faktur

### Jednotlivá faktura

1. V menu vyberte **"Faktury"**
2. Klikněte **"Nová faktura"**
3. Vyberte:
   - **Organizaci**
   - **Měsíc a rok**
4. Systém automaticky:
   - Načte všechny výkazy
   - Přidá paušální služby
   - Vypočítá celkovou částku
5. Zkontrolujte údaje
6. Klikněte **"Vygenerovat fakturu"**

### Hromadné generování

1. Na dashboardu klikněte **"Generovat faktury"**
2. Vyberte měsíc a rok
3. Systém zobrazí seznam organizací
4. Vyberte organizace pro fakturaci
5. Klikněte **"Vygenerovat vybrané"**

### Úprava faktury

1. Otevřete detail faktury
2. Můžete upravit:
   - Jednotlivé položky
   - Přidat/odebrat řádky
   - Změnit ceny
   - Přidat poznámku
3. Klikněte **"Uložit a přegenerovat PDF"**

## 🔄 Export do Pohody

### Export jednotlivé faktury

1. Otevřete detail faktury
2. Klikněte **"Export do Pohody"**
3. Stáhne se XML soubor

### Hromadný export

1. V seznamu faktur vyberte faktury
2. Klikněte **"Export vybraných"**
3. Stáhne se ZIP s XML soubory

### Import do Pohody

1. V Pohodě otevřete menu **Soubor → Import → XML**
2. Vyberte stažený XML soubor
3. Zkontrolujte nastavení importu:
   - Typ dokladu: Faktura vydaná
   - Číselná řada: Vaše řada
4. Klikněte **"OK"**
5. Pohoda zobrazí přehled importu
6. Potvrďte import

## 📊 Reporty a statistiky

### Měsíční přehled

1. V menu vyberte **"Reporty"**
2. Vyberte **"Měsíční přehled"**
3. Nastavte měsíc a rok
4. Report zobrazí:
   - Součet hodin po organizacích
   - Celkové tržby
   - Porovnání s minulými měsíci
   - Graf vývoje

### Export do Excelu

1. V libovolném přehledu klikněte **"Export do Excelu"**
2. Vyberte rozsah dat
3. Stáhne se Excel soubor

### Vlastní reporty

1. Vyberte **"Vlastní report"**
2. Nastavte:
   - Období
   - Organizace
   - Typ dat
3. Klikněte **"Generovat"**

## 💡 Tipy a triky

### Klávesové zkratky

- **Ctrl + S** - Uložit změny
- **Ctrl + N** - Nový záznam
- **Ctrl + F** - Vyhledávání
- **Esc** - Zavřít dialog

### Hromadné úpravy

1. V tabulce držte **Shift** a klikněte pro výběr rozsahu
2. Nebo **Ctrl** + klik pro výběr jednotlivých řádků
3. Pravé tlačítko zobrazí kontextové menu

### Šablony

1. V nastavení vytvořte šablony pro:
   - Často používané popisy práce
   - Standardní položky faktur
2. Při vytváření použijte šablonu

### Automatizace

- Nastavte pravidelné paušální služby
- Vytvořte pravidla pro automatické přiřazení organizací
- Naplánujte automatické generování faktur

### Zálohování

**Důležité:** Pravidelně zálohujte data!
1. V menu **"Nastavení → Zálohy"**
2. Klikněte **"Vytvořit zálohu"**
3. Stáhněte ZIP archiv
4. Uložte na bezpečné místo

### Řešení problémů

**Faktura se negeneruje:**
- Zkontrolujte, zda organizace má všechny údaje (IČO, DIČ)
- Ověřte, že existují výkazy pro dané období

**PDF se nezobrazuje správně:**
- Použijte Chrome nebo Firefox
- Zkontrolujte blokování pop-up oken

**Import selhal:**
- Ověřte formát Excel souboru
- Zkontrolujte názvy sloupců
- Ujistěte se, že soubor není chráněný heslem

## 📞 Podpora

Potřebujete pomoc?

1. Zkontrolujte tuto příručku
2. Podívejte se do [FAQ](faq.md)
3. Kontaktujte podporu:
   - Email: support@vase-firma.cz
   - Telefon: +420 123 456 789
   - Chat: V aplikaci vpravo dole

---

**Tip:** Tuto příručku si můžete vytisknout nebo uložit jako PDF pro offline použití.