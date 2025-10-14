const DEFAULT_OCR_URL = process.env.MISTRAL_OCR_URL || 'https://api.mistral.ai/v1/ocr';

const ensureArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const toNumber = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toIsoDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

const pickFirst = (source, keys = []) => {
  if (!source) return undefined;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return undefined;
};

const parseMockInvoice = () => {
  const now = new Date();
  return {
    supplierName: 'Neznámý dodavatel',
    supplierIco: null,
    invoiceNumber: `TMP-${now.getTime()}`,
    issueDate: now.toISOString(),
    currency: 'CZK',
    items: [
      {
        itemName: 'Položka z OCR',
        description: 'OCR nedostupné, použita mock data',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        vatRate: 0
      }
    ]
  };
};

const normalizeItems = (items = []) => {
  return ensureArray(items).map((item) => {
    const qty = pickFirst(item, ['quantity', 'qty']);
    const unitPrice = pickFirst(item, ['unit_price', 'unitPrice', 'price_unit']);
    const totalPrice = pickFirst(item, ['total_price', 'totalPrice', 'amount', 'price_total']);
    const vatRate = pickFirst(item, ['vat_rate', 'vatRate', 'tax_rate']);

    return {
      itemName: item.name || item.title || item.description || 'Položka',
      description: item.description || item.details || null,
      quantity: toNumber(qty, 1) ?? 1,
      unitPrice: toNumber(unitPrice, null),
      totalPrice: toNumber(totalPrice, null),
      vatRate: toNumber(vatRate, null)
    };
  });
};

const normalizeResponse = (payload) => {
  if (!payload) {
    return parseMockInvoice();
  }

  const invoice = payload.invoice || payload.document || {};
  const supplier = payload.supplier || payload.vendor || invoice.supplier || {};
  const totals = payload.totals || invoice.totals || {};
  const currency = payload.currency || invoice.currency || totals.currency || 'CZK';

  const items = normalizeItems(
    payload.items || payload.line_items || invoice.items || totals.items || []
  );

  return {
    supplierName: supplier.name || invoice.supplierName || 'Neznámý dodavatel',
    supplierIco: supplier.ico || supplier.ic || supplier.registration || null,
    invoiceNumber: invoice.number || invoice.invoice_number || payload.invoice_number || `TMP-${Date.now()}`,
    issueDate: toIsoDate(invoice.date || invoice.issue_date || payload.issueDate || payload.date),
    currency,
    totalWithoutVat: toNumber(totals.excluding_vat || totals.net || invoice.total_ex_tax, null),
    totalWithVat: toNumber(totals.including_vat || totals.gross || invoice.total_inc_tax, null),
    items: items.length ? items : parseMockInvoice().items
  };
};

async function callMistralOcr({ buffer, filename, mimetype }) {
  const apiKey = process.env.MISTRAL_OCR_API_KEY || process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    console.warn('[OCR] MISTRAL_OCR_API_KEY není nastaven, vracím mock data.');
    return parseMockInvoice();
  }

  if (!buffer) {
    throw new Error('OCR vyžaduje binární obsah souboru.');
  }

  const endpoint = DEFAULT_OCR_URL;

  const requestPayload = {
    document: {
      filename: filename || 'invoice.pdf',
      mimetype: mimetype || 'application/pdf',
      content: buffer.toString('base64')
    },
    options: {
      language: process.env.MISTRAL_OCR_LANGUAGE || 'cs',
      extract_line_items: true
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestPayload)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`OCR služba vrátila chybu ${response.status}: ${text}`);
  }

  const responsePayload = await response.json();
  return normalizeResponse(responsePayload);
}

async function parseInvoice({ buffer, filename, mimetype } = {}) {
  try {
    if (buffer) {
      return await callMistralOcr({ buffer, filename, mimetype });
    }
    console.warn('[OCR] Nebyl poskytnut žádný soubor, vracím mock data.');
    return parseMockInvoice();
  } catch (error) {
    console.error('[OCR] Chyba při volání Mistral OCR:', error.message);
    return parseMockInvoice();
  }
}

module.exports = {
  parseInvoice
};
