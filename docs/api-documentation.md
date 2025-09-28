# API Dokumentace - Fakturační Systém

## Základní informace

**Base URL:** `http://localhost:3002/api`  
**Autentizace:** Bearer Token (JWT)  
**Content-Type:** `application/json` (pokud není uvedeno jinak)

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

#### Registrace nového uživatele
```http
POST /auth/register
Authorization: Bearer <admin-token>
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "Jan Novák",
  "role": "USER"
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
  "organizations": [
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
  "total": 15,
  "page": 1,
  "totalPages": 1
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
  }
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
