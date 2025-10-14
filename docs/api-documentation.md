# API Dokumentace - Fakturační Systém

## Základní informace

**Base URL:** `http://localhost:3002/api`  
**Autentizace:** Bearer Token (JWT)  
**Content-Type:** `application/json` (pokud není uvedeno jinak)

**Další dokumentace:** [Integrace přijatých faktur](./integration-plan.md)

## Autentizace

Všechny endpointy kromě `/auth/login` vyžadují autentizaci pomocí Bearer tokenu v hlavičce:

```
Authorization: Bearer <token>
```

## Endpointy

### 🔐 Autentizace

#### Login
```http
POST /auth/login
```

**Request Body:**
```json
{
  "email": "admin@fakturace.cz",
  "password": "admin123"
}
```

**Response:** `200 OK`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "email": "admin@fakturace.cz",
    "name": "Administrator",
    "role": "ADMIN"
  }
}
```

#### Ověření platnosti tokenu
```http
GET /auth/verify
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": 1,
    "email": "admin@fakturace.cz",
    "name": "Administrator",
    "role": "ADMIN"
  }
}
```

### 🏢 Organizace

#### Seznam organizací
```http
GET /organizations
Authorization: Bearer <token>
```

**Query parametry:**
- `search` - vyhledávání v názvu nebo kódu
- `page` - číslo stránky (výchozí: 1)
- `limit` - počet položek na stránku (výchozí: 20)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": 1,
      "name": "Lázně Toušeň",
      "code": "LT",
      "hourlyRate": 550,
      "kmRate": 10,
      "contactPerson": "Jan Novák",
      "email": "info@laznetousen.cz",
      "phone": "+420 123 456 789",
      "address": "Hlavní 123, 250 89 Lázně Toušeň",
      "ico": "12345678",
      "dic": "CZ12345678"
    }
  ],
  "total": 15
}
```

#### Detail organizace
```http
GET /organizations/:id
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "name": "Lázně Toušeň",
  "code": "LT",
  "hourlyRate": 550,
  "kmRate": 10,
  "contactPerson": "Jan Novák",
  "email": "info@laznetousen.cz",
  "services": [
    {
      "id": 1,
      "serviceName": "Správa IT",
      "description": "Měsíční paušál za správu IT",
      "monthlyPrice": 5000,
      "isActive": true
    }
  ]
}
```

#### Vytvoření organizace
```http
POST /organizations
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "Nová firma s.r.o.",
  "code": "NF",
  "hourlyRate": 600,
  "kmRate": 12,
  "contactPerson": "Petr Novotný",
  "email": "info@nova-firma.cz",
  "phone": "+420 987 654 321",
  "address": "Průmyslová 456, 130 00 Praha 3",
  "ico": "87654321",
  "dic": "CZ87654321"
}
```

#### Aktualizace organizace
```http
PUT /organizations/:id
Authorization: Bearer <token>
```

**Request Body:** Stejné jako při vytváření

#### Smazání organizace
```http
DELETE /organizations/:id
Authorization: Bearer <token>
```

### 📄 Import dat

#### Import Excel souboru
```http
POST /import
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data:**
- `file` - Excel soubor (.xlsx)
- `month` - Měsíc (1-12)
- `year` - Rok (např. 2025)

**Response:** `200 OK`
```json
{
  "success": true,
  "imported": 82,
  "organizations": 13,
  "errors": [],
  "details": {
    "totalRows": 85,
    "skippedRows": 3,
    "newOrganizations": 2
  },
  "newlyCreatedOrganizations": [
    {
      "id": 42,
      "name": "Nová organizace",
      "code": "NEW"
    }
  ]
}
```

### 🧾 Přijaté faktury (OCR)

#### Nahrání faktury (OCR nebo JSON)
```http
POST /received-invoices/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data | application/json
```

**Varianty vstupu:**
- `multipart/form-data` s polem `file` (PDF/JPEG). Backend převádí dokument na Base64 a volá API Mistral OCR (`MISTRAL_OCR_*`).
- `application/json` – manuálně poskytnutý výstup OCR (`invoiceNumber`, `supplierName`, `items`…).

**Response:** `201 Created`
```json
{
  "invoice": {
    "id": 12,
    "supplierName": "Dodavatel s.r.o.",
    "invoiceNumber": "FA-2025-001",
    "status": "PENDING"
  },
  "items": [
    {
      "id": 34,
      "itemName": "Switch 24p",
      "quantity": 1,
      "unitPrice": "4500",
      "totalPrice": "4500",
      "status": "PENDING"
    }
  ]
}
```

#### Seznam přijatých faktur
```http
GET /received-invoices
Authorization: Bearer <token>
```

**Query parametry (volitelné):** `status` (`PENDING`, `READY`, `ARCHIVED`).

#### Detail faktury včetně položek
```http
GET /received-invoices/:id
Authorization: Bearer <token>
```

#### Uložení upravených položek
```http
PUT /received-invoices/:id/items
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [
    { "id": 34, "itemName": "Switch", "quantity": 2, "unitPrice": 4300, "totalPrice": 8600 }
  ]
}
```

#### Schválení / archivace faktury
```http
POST /received-invoices/:id/approve
POST /received-invoices/:id/reject
Authorization: Bearer <token>
```

#### Seznam položek napříč fakturami
```http
GET /received-invoices/items/list
Authorization: Bearer <token>
```

**Query parametry (volitelné):** `status` (`PENDING`, `APPROVED`, `ASSIGNED`, `INVOICED`), `organizationId`, `invoiceId`.

#### Přiřazení položky k organizaci (vznik záznamu hardware)
```http
POST /received-invoices/items/:id/assign
Authorization: Bearer <token>
Content-Type: application/json

{
  "organizationId": 5,
  "month": 7,
  "year": 2025
}
```

### 🛠️ Hardware

#### Seznam hardware položek
```http
GET /hardware
Authorization: Bearer <token>
```

**Query parametry:** `organizationId`, `month`, `year`, `status` (`NEW`, `MANUAL`, `ASSIGNED`, `INVOICED`). Odpověď obsahuje i vazbu na fakturu (dodavatel, číslo faktury), pokud položka pochází z OCR.

#### Označení položky jako vyfakturované
```http
POST /hardware/:id/mark-invoiced
Authorization: Bearer <token>
```

### 💶 Fakturační podklady

#### Přehled pro organizaci a období
```http
GET /billing/summary
Authorization: Bearer <token>
```

**Query parametry:**
- `organizationId` *(povinné)*
- `month` *(volitelné, výchozí aktuální měsíc)*
- `year` *(volitelné, výchozí aktuální rok)*

**Response:** `200 OK`
```json
{
  "base": {
    "organization": {
      "id": 5,
      "name": "Test Fakturace s.r.o.",
      "code": "TF",
      "hourlyRate": 650,
      "kmRate": 12
    },
    "period": {
      "month": 7,
      "year": 2025
    },
    "services": [
      {
        "id": 12,
        "serviceName": "Outsourcing",
        "description": "Měsíční paušál",
        "monthlyPrice": 5000
      }
    ],
    "work": {
      "entries": [
        {
          "id": 44,
          "date": "2025-07-15T00:00:00.000Z",
          "worker": "Jan Technik",
          "description": "Servisní zásah",
          "minutes": 180,
          "hours": 3,
          "kilometers": 20,
          "hourlyAmount": 1950,
          "kmAmount": 240
        }
      ],
      "summary": {
        "totalMinutes": 180,
        "totalHours": 3,
        "totalKm": 20,
        "hourlyAmount": 1950,
        "kmAmount": 240
      }
    },
    "hardware": [
      {
        "id": 9,
        "itemName": "Switch 24 portů",
        "description": "Instalace pro centrálu",
        "quantity": 1,
        "unitPrice": 4500,
        "totalPrice": 4500
      }
    ],
    "software": [],
    "totals": {
      "workAmount": 1950,
      "kmAmount": 240,
      "servicesAmount": 5000,
      "hardwareAmount": 4500,
      "totalAmount": 11690,
      "totalVat": 2454.9,
      "totalWithVat": 14144.9
    }
  },
  "draft": {
    "data": { /* uložený návrh, pokud existuje */ },
    "updatedAt": "2025-07-25T09:15:00.000Z",
    "updatedBy": 1
  }
}
```

#### Uložení návrhu
```http
PUT /billing/draft
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "organizationId": 5,
  "month": 7,
  "year": 2025,
  "data": {
    "rates": {
      "hourlyRate": "650",
      "kmRate": "12",
      "extraHourlyRate": "750",
      "extraKmRate": "15"
    },
    "services": [
      {
        "id": null,
        "serviceName": "Konzultace",
        "description": "Ad-hoc práce",
        "monthlyPrice": 1500
      }
    ],
    "work": {
      "entries": [
        {
          "id": null,
          "date": "2025-07-20",
          "worker": "Eva Testerová",
          "description": "Diagnostika",
          "minutes": 120,
          "hours": 2,
          "kilometers": 10,
          "hourlyAmount": 1400,
          "kmAmount": 120
        }
      ],
      "notes": "Přidat do faktury jako mimořádný zásah."
    },
    "hardware": [],
    "software": [],
    "notes": "Ověřit ceny před vystavením."
  }
}
```

**Response:** `200 OK`
```json
{
  "data": {
    "rates": {
      "hourlyRate": "650",
      "kmRate": "12",
      "extraHourlyRate": "750",
      "extraKmRate": "15"
    },
    "notes": "Ověřit ceny před vystavením."
  },
  "updatedAt": "2025-07-25T09:20:12.000Z",
  "updatedBy": 1
}
```

### 💼 Pracovní výkazy

#### Seznam výkazů
```http
GET /work-records
Authorization: Bearer <token>
```

**Query parametry:**
- `month` - Měsíc (1-12)
- `year` - Rok
- `organizationId` - ID organizace
- `workerName` - Jméno pracovníka
- `page` - Číslo stránky
- `limit` - Počet položek

**Response:** `200 OK`
```json
{
  "records": [
    {
      "id": 1,
      "organizationId": 1,
      "billingOrgId": 1,
      "date": "2025-07-14",
      "workerName": "Jan Novák",
      "description": "Instalace serveru",
      "hours": "8:30",
      "kilometers": 120,
      "price": 5875,
      "projectCode": "INST-001",
      "organization": {
        "name": "Lázně Toušeň",
        "code": "LT"
      }
    }
  ],
  "summary": {
    "totalHours": "85:30",
    "totalKilometers": 1200,
    "totalPrice": 58750
  },
  "total": 50,
  "page": 1,
  "totalPages": 3
}
```

#### Vytvoření výkazu
```http
POST /work-records
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "organizationId": 1,
  "billingOrgId": 1,
  "date": "2025-07-14",
  "workerName": "Jan Novák",
  "description": "Instalace serveru",
  "hours": "8:30",
  "kilometers": 120,
  "projectCode": "INST-001"
}
```

#### Aktualizace výkazu
```http
PUT /work-records/:id
Authorization: Bearer <token>
```

#### Smazání výkazu
```http
DELETE /work-records/:id
Authorization: Bearer <token>
```

#### Hromadné smazání
```http
POST /work-records/bulk-delete
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "ids": [1, 2, 3, 4, 5]
}
```

### 🛠️ Služby

#### Seznam služeb organizace
```http
GET /services?organizationId=1
Authorization: Bearer <token>
```

#### Vytvoření služby
```http
POST /services
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "organizationId": 1,
  "serviceName": "Správa sítě",
  "description": "Měsíční paušál za správu počítačové sítě",
  "monthlyPrice": 8000,
  "isActive": true
}
```

#### Aktualizace služby
```http
PUT /services/:id
Authorization: Bearer <token>
```

#### Smazání služby
```http
DELETE /services/:id
Authorization: Bearer <token>
```

### 🖥️ Hardware

#### Seznam hardware
```http
GET /hardware
Authorization: Bearer <token>
```

**Query parametry:**
- `organizationId` - ID organizace
- `month` - Měsíc
- `year` - Rok

#### Přidání hardware
```http
POST /hardware
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "organizationId": 1,
  "itemName": "Dell OptiPlex 7090",
  "description": "Stolní počítač, i5, 16GB RAM, 512GB SSD",
  "quantity": 2,
  "unitPrice": 25000,
  "month": 7,
  "year": 2025
}
```

### 📑 Faktury

#### Seznam faktur
```http
GET /invoices
Authorization: Bearer <token>
```

**Query parametry:**
- `month` - Měsíc
- `year` - Rok
- `organizationId` - ID organizace
- `status` - Stav faktury (DRAFT, SENT, PAID)

#### Generování faktury
```http
POST /invoices/generate
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "organizationId": 1,
  "month": 7,
  "year": 2025,
  "dueDate": "2025-08-14",
  "notes": "Faktura za IT služby"
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "invoiceNumber": "2025070001",
  "organizationId": 1,
  "month": 7,
  "year": 2025,
  "totalAmount": 15000,
  "totalVat": 3150,
  "status": "DRAFT",
  "pdfUrl": "/api/invoices/1/pdf"
}
```

#### Stažení PDF faktury
```http
GET /invoices/:id/pdf
Authorization: Bearer <token>
```

**Response:** PDF soubor

#### Export do Pohody
```http
GET /invoices/:id/pohoda-xml
Authorization: Bearer <token>
```

**Response:** XML soubor pro import do Pohody

#### Export faktury (alias)
```http
GET /invoices/:id/export
Authorization: Bearer <token>
```

**Response:** XML soubor identický s `/pohoda-xml`

#### Aktualizace faktury
```http
PUT /invoices/:id
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "status": "SENT",
  "notes": "Odesláno emailem",
  "paymentDate": "2025-08-10"
}
```

#### Smazání faktury
```http
DELETE /invoices/:id
Authorization: Bearer <token>
```

#### Hromadný export do Pohody
```http
POST /invoices/export-batch
Authorization: Bearer <token>
Content-Type: application/json

{
  "invoiceIds": [1, 2, 3]
}
```

**Response:** XML soubor s hromadným exportem všech vybraných faktur. Pokud některé faktury nejsou nalezeny, vrací 404 s detaily.

## Chybové stavy

### Struktura chybové odpovědi
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Neplatná data",
    "details": {
      "field": "email",
      "reason": "Email již existuje"
    }
  }
}
```

### HTTP Status kódy

| Kód | Význam |
|-----|--------|
| 200 | OK - Úspěšná odpověď |
| 201 | Created - Zdroj vytvořen |
| 400 | Bad Request - Neplatný požadavek |
| 401 | Unauthorized - Chybí nebo neplatná autentizace |
| 403 | Forbidden - Nedostatečná oprávnění |
| 404 | Not Found - Zdroj nenalezen |
| 409 | Conflict - Konflikt (např. duplicitní data) |
| 422 | Unprocessable Entity - Validační chyba |
| 500 | Internal Server Error - Chyba serveru |

## Rate Limiting

API má nastaven rate limit:
- 100 požadavků za minutu pro autentizované uživatele
- 20 požadavků za minutu pro neautentizované požadavky

Při překročení limitu obdržíte odpověď `429 Too Many Requests`.

## Příklady použití

### cURL
```bash
# Login
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fakturace.cz","password":"admin123"}'

# Seznam organizací
curl http://localhost:3002/api/organizations \
  -H "Authorization: Bearer <token>"

# Import Excel
curl -X POST http://localhost:3002/api/import \
  -H "Authorization: Bearer <token>" \
  -F "file=@vykaz.xlsx" \
  -F "month=7" \
  -F "year=2025"
```

### JavaScript (Axios)
```javascript
// Login
const { data } = await axios.post('/api/auth/login', {
  email: 'admin@fakturace.cz',
  password: 'admin123'
});
const token = data.token;

// Seznam organizací
const organizations = await axios.get('/api/organizations', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Import Excel
const formData = new FormData();
formData.append('file', excelFile);
formData.append('month', '7');
formData.append('year', '2025');

await axios.post('/api/import', formData, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'multipart/form-data'
  }
});
```

## Webhooks (budoucí funkce)

Systém podporuje webhooky pro následující události:
- `invoice.created` - Faktura vytvořena
- `invoice.sent` - Faktura odeslána
- `invoice.paid` - Faktura zaplacena
- `import.completed` - Import dokončen

Konfigurace webhooků bude dostupná v administraci.
