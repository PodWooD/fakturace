const test = require('node:test');
const assert = require('node:assert/strict');

const originalFetch = globalThis.fetch;
const originalKey = process.env.MISTRAL_OCR_API_KEY;

function createJsonResponse(body, init = {}) {
  const jsonInit = { status: 200, headers: { 'Content-Type': 'application/json' }, ...init };
  return new Response(JSON.stringify(body), jsonInit);
}

test('Mistral OCR integration flow uploads file and returns parsed invoice data', async (t) => {
  let callIndex = 0;
  const mockResponses = [
    createJsonResponse({
      id: 'file_123',
      object: 'file',
      filename: 'invoice.pdf',
      mimetype: 'application/pdf',
      purpose: 'ocr',
    }),
    createJsonResponse({
      url: 'https://signed-url.example/invoice.pdf',
    }),
    createJsonResponse({
      invoice: {
        invoice_number: 'INV-2024-001',
        issue_date: '2024-01-10',
      },
      supplier: {
        name: 'Dodavatel s.r.o.',
        ico: '12345678',
      },
      totals: {
        including_vat: 121000,
        excluding_vat: 100000,
        currency: 'CZK',
      },
      items: [
        {
          name: 'IT služby',
          quantity: 2,
          unit_price: 50000,
          total_price: 100000,
          vat_rate: 21,
        },
      ],
    }),
  ];

  process.env.MISTRAL_OCR_API_KEY = 'test-key';
  globalThis.fetch = async (input, init) => {
    assert.ok(callIndex < mockResponses.length, 'Unexpected fetch call');
    return mockResponses[callIndex++];
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.MISTRAL_OCR_API_KEY;
    } else {
      process.env.MISTRAL_OCR_API_KEY = originalKey;
    }
    delete require.cache[require.resolve('./ocrService')];
  });

  delete require.cache[require.resolve('./ocrService')];
  const { parseInvoice } = require('./ocrService');

  const buffer = Buffer.from('%PDF-1.4 fake content');
  const result = await parseInvoice({ buffer, filename: 'invoice.pdf', mimetype: 'application/pdf' });

  assert.equal(callIndex, 3, 'Expected three HTTP calls (files upload, signed URL, OCR)');
  assert.equal(result.__mock, undefined, 'Expected real OCR result, not mock fallback');
  assert.equal(result.invoiceNumber, 'INV-2024-001');
  assert.equal(result.supplierName, 'Dodavatel s.r.o.');
  assert.equal(result.items.length, 1);
  assert.equal(result.currency, 'CZK');
});

test('Mistral OCR failure bubbles up error without falling back silently', async (t) => {
  process.env.MISTRAL_OCR_API_KEY = 'test-key';
  let callIndex = 0;
  const errorBody = { object: 'error', message: 'Service unavailable.' };
  globalThis.fetch = async () => {
    callIndex += 1;
    return new Response(JSON.stringify(errorBody), { status: 500, headers: { 'Content-Type': 'application/json' } });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.MISTRAL_OCR_API_KEY;
    } else {
      process.env.MISTRAL_OCR_API_KEY = originalKey;
    }
    delete require.cache[require.resolve('./ocrService')];
  });

  delete require.cache[require.resolve('./ocrService')];
  const { parseInvoice } = require('./ocrService');

  const buffer = Buffer.from('%PDF-1.4 fake content');
  const result = await parseInvoice({ buffer, filename: 'invoice.pdf', mimetype: 'application/pdf' });

  assert.equal(callIndex, 1, 'Failure should occur on first fetch (files upload)');
  assert.equal(result.__mock, true, 'Expected mock fallback with error information');
  assert.ok(result.errorMessage.includes('Mistral files API vrátilo chybu'), 'Expected error message from OCR failure');
});

test('Mistral OCR parses markdown-only response into structured invoice', async (t) => {
  let callIndex = 0;
  const markdown = `
# Faktura - Daňový doklad - 12345

**Prodávající:** Test s.r.o.
IČ: 12345678

|  Kód | Popis | Ks | Cena ks | bez DPH | DPH | DPH% | Cena | Záruka  |
|  AA1 | Testovací položka A | 2 | 1 000,00 | 2 000,00 | 420,00 | 21 | 2 420,00 | 12  |
|  BB2 | Testovací položka B | 1 | 500,00 | 500,00 | 105,00 | 21 | 605,00 | 12  |

Celkem: 3 025,00 Kč

Datum vystavení: 17.09.2025
`.trim();

  const mockResponses = [
    createJsonResponse({ id: 'file_123' }),
    createJsonResponse({ url: 'https://signed-url.example/invoice.pdf' }),
    createJsonResponse({
      pages: [{ index: 0, markdown }],
      model: 'mistral-ocr-latest',
    }),
  ];

  process.env.MISTRAL_OCR_API_KEY = 'test-key';
  globalThis.fetch = async () => mockResponses[callIndex++];

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.MISTRAL_OCR_API_KEY;
    } else {
      process.env.MISTRAL_OCR_API_KEY = originalKey;
    }
    delete require.cache[require.resolve('./ocrService')];
  });

  delete require.cache[require.resolve('./ocrService')];
  const { parseInvoice } = require('./ocrService');

  const buffer = Buffer.from('%PDF-1.4 fake content');
  const result = await parseInvoice({ buffer, filename: 'invoice.pdf', mimetype: 'application/pdf' });

  assert.equal(callIndex, 3);
  assert.equal(result.__mock, undefined);
  assert.equal(result.invoiceNumber, '12345');
  assert.equal(result.supplierName, 'Test s.r.o.');
  assert.equal(result.supplierIco, '12345678');
  assert.equal(result.currency, 'CZK');
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.items[0].unitPrice, 1000);
  assert.equal(result.totalWithVat, 3025);
  assert.equal(result.totalWithoutVat, 2500);
  assert.equal(result.issueDate, '2025-09-17T00:00:00.000Z');
});
