# Integrace přijatých faktur a hardware do systému

## Cíl

- Automatizovat import papírových/PDF faktur pomocí OCR (API Mistral).  
- Rozepsat nahranou fakturu na jednotlivé položky hardware.  
- Umožnit uživateli manuální kontrolu a úpravu položek.  
- Převést schválené položky do evidence hardware a následně do fakturace.  
- Přiřazením položek k organizaci sledovat stav (nová → přiřazená → vyfakturovaná).

## Datový model

- **ReceivedInvoice** – metadata importované faktury.  
  - `id`, `supplierName`, `supplierIco`, `invoiceNumber`, `issueDate`, `totalWithoutVat`, `totalWithVat`, `status` (`DRAFT`, `READY`, `ARCHIVED`), `sourceFilePath`, `ocrPayload`, `createdBy`, `createdAt`, `updatedAt`.  
- **ReceivedInvoiceItem** – jednotlivé položky hardware/software.  
  - `invoiceId`, `itemName`, `description`, `quantity`, `unitPrice`, `totalPrice`, `vatRate`, `status` (`PENDING`, `APPROVED`, `REJECTED`), `assignedOrganizationId`, `assignedBy`, `assignedAt`.  
- **Hardware** – rozšířit existující model o `sourceInvoiceId`, `sourceItemId`, `status` (`NEW`, `ASSIGNED`, `INVOICED`).

## API

### OCR import

- `POST /api/received-invoices/upload`  
  - Vstup: soubor (PDF/image), volitelně dodavatel/datum (pokud uživatel zadá ručně).  
  - Akce: upload → zavolá Mistral OCR → uloží `ReceivedInvoice` + položky `ReceivedInvoiceItem` (stav `PENDING`).  
  - Backend automaticky rozseká položky na **jednotky o množství 1** (např. 5× monitor → pět samostatných řádků).  
  - Slevové položky (řádky se zápornou cenou) se párují k odpovídajícím produktům podle identifikátoru/sufixu a v UI se zobrazují ve skupinách.  
  - Odpověď: náhled položek, odkaz na editaci.

### Editace přijaté faktury

- `GET /api/received-invoices/:id` – vrátí fakturu + položky.  
- `PUT /api/received-invoices/:id/items` – batch update položek (úprava textů, cen, množství).  
- `POST /api/received-invoices/:id/approve` – označí položky jako `APPROVED` a fakturu jako `READY`.  
- `POST /api/received-invoices/:id/reject` – archivace nebo opětovné zpracování.

### Převod do hardware

- `GET /api/hardware/pending` – seznam schválených položek (`status = NEW`).  
- `PUT /api/hardware/:id/assign` – přiřadí položku k organizaci (nastaví `assignedOrganizationId`, `status = ASSIGNED`).

### Integrace s fakturací

- Záložka „Fakturace“ při načtení otevře modální okno „Přidat hardware z přijatých faktur“.  
- Vévo modálu: volání `GET /api/hardware/pending?organizationId=&month=&year=`.  
- Po přidání položek do draftu: `PUT /api/billing/draft` + `PUT /api/hardware/:id/mark-invoiced` (stav `INVOICED`).

## Frontend workflow

1. Záložka **Import dat** – sekce „Import faktury“ (drag & drop). Po nahrání zobrazí OCR návrat, umožní poslat na editaci.  
2. Záložka **Faktury přijaté** – přehled všech faktur ve stavu `PENDING`/`READY`. Detail faktury zobrazuje kontrolní součet položek vs. celkovou částku faktury a zvýrazní případný rozdíl. Slevové řádky jsou automaticky seskupeny pod příslušnými položkami, k dispozici je tlačítko **Náhled faktury** pro stažení originálního souboru a akce pro schválení/archivaci. Uživatel může řádky upravit, doplnit nebo fakturu schválit/odmítnout.  
3. Záložka **Hardware** – zobrazuje `APPROVED` položky, které ještě nebyly přiřazeny. Uživatel vybere organizaci, období, případně poznámku → stav `ASSIGNED`.  
4. Záložka **Fakturace** – modální výběr položek s `status = ASSIGNED` pro danou organizaci. Při uložení draftu se položky označí jako `INVOICED`.

## Validace a audit

- Po importu systém vizuálně kontroluje součet položek a porovnává jej s celkovou částkou faktury (tolerance ±1 Kč kvůli zaokrouhlení).  
- Logovat kdo co upravil (timestamp + uživatel).  
- Uchovat originální soubor + OCR JSON kvůli traceability.  
- Možnost znovu importovat fakturu (např. při opravě OCR) – starou verzi archivovat.

## Otevřené otázky

- Budeme mít tabulku dodavatelů (např. `Supplier`)?  
- Jak řešit faktury, které obsahují více různých typů položek (hardware + služby)?  
- Potřebujeme workflow schvalování (např. dvoustupňové potvrzení)?

## Implementační kroky

1. Připravit datové modely (`ReceivedInvoice`, `ReceivedInvoiceItem`, úprava `Hardware`).  
2. Zaintegrovat Mistral OCR (konfigurovat `MISTRAL_OCR_API_KEY`, `MISTRAL_OCR_URL`, volitelně `MISTRAL_OCR_LANGUAGE`).  
3. Backend endpointy pro import, editaci, přiřazení.  
4. Frontend UI – Import faktur, editace položek, záložka Hardware.  
5. Napojení na záložku Fakturace (výběr hardware).  
6. Testy (unit, integrační, E2E) a aktualizace dokumentace.
