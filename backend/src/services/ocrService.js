const DEFAULT_OCR_URL = process.env.MISTRAL_OCR_URL || 'https://api.mistral.ai/v1/ocr';
const DEFAULT_FILES_URL = process.env.MISTRAL_FILES_URL || 'https://api.mistral.ai/v1/files';
const DEFAULT_OCR_MODEL = process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest';

let pdfParseAdapter = null;

const ensureArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const extractReferenceProductCode = (itemName = '', description = '') => {
  const combined = `${itemName} ${description}`.toLowerCase();
  const match = combined.match(/k\s+položce\s+([a-z0-9_\-]+)/i);
  if (match && match[1]) {
    return match[1];
  }
  const altMatch = combined.match(/k\s+polozce\s+([a-z0-9_\-]+)/i);
  if (altMatch && altMatch[1]) {
    return altMatch[1];
  }
  return null;
};

const parseLocalizedNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value
    .replace(/\u00A0/g, '')
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^0-9.+-]/g, '');
  if (!normalized || normalized === '-' || normalized === '+') {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNumber = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toIsoDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const czechMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (czechMatch) {
      const [, dayStr, monthStr, yearStr] = czechMatch;
      const day = parseInt(dayStr, 10);
      const month = parseInt(monthStr, 10);
      const year = parseInt(yearStr, 10);
      if (day > 0 && month >= 1 && month <= 12 && year > 1900) {
        const iso = new Date(Date.UTC(year, month - 1, day));
        return iso.toISOString();
      }
    }
  }
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

const parseMockInvoice = (reason = 'OCR nedostupné, použita mock data') => {
  const now = new Date();
  return {
    supplierName: 'Neznámý dodavatel',
    supplierIco: null,
    invoiceNumber: `TMP-${now.getTime()}`,
    issueDate: now.toISOString(),
    currency: 'CZK',
    items: [
      {
        itemName: 'OCR chyba',
        description: reason,
        quantity: 0,
        unitPrice: 0,
        totalPrice: 0,
        vatRate: 0,
        status: 'ERROR'
      }
    ],
    __mock: true,
    errorMessage: reason
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

const mapCurrency = (value) => {
  if (!value) return 'CZK';
  const normalized = value
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (normalized === 'KC' || normalized === 'KCS') return 'CZK';
  if (normalized === 'EUR' || normalized === 'EURO' || normalized === 'E') return 'EUR';
  if (normalized === 'USD' || normalized === 'US$' || normalized === '$') return 'USD';
  if (normalized === 'GBP' || normalized === '£') return 'GBP';
  if (normalized === 'PLN' || normalized === 'ZL' || normalized === 'ZLOTY') return 'PLN';
  if (/^[A-Z]{3}$/.test(normalized)) return normalized;
  return 'CZK';
};

const stripDiacritics = (value = '') =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

const tryInitPdfParser = () => {
  if (!pdfParseAdapter) {
    try {
      // Lazy load pdf-parse, protože jej potřebujeme jen při lokálním fallbacku.
      // eslint-disable-next-line global-require
      const pdfModule = require('pdf-parse');
      if (pdfModule && typeof pdfModule.PDFParse === 'function') {
        pdfParseAdapter = { mode: 'class', ctor: pdfModule.PDFParse };
      } else if (typeof pdfModule === 'function') {
        pdfParseAdapter = { mode: 'function', fn: pdfModule };
      } else {
        pdfParseAdapter = null;
      }
    } catch (error) {
      console.warn('[OCR] pdf-parse není dostupné, lokální fallback nelze použít:', error.message);
      pdfParseAdapter = null;
    }
  }
  return pdfParseAdapter;
};

const extractFirstMatch = (text, patterns = []) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  return null;
};

const normalizeLines = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length);

const attemptLocalPdfParse = async ({ buffer, filename, mimetype }) => {
  const parserAdapter = tryInitPdfParser();
  if (!parserAdapter || !buffer || !buffer.length) {
    return null;
  }

  if (mimetype && !/pdf$/i.test(mimetype) && !mimetype.includes('pdf')) {
    return null;
  }
  if (!mimetype && filename) {
    const lower = filename.toLowerCase();
    if (!lower.endsWith('.pdf')) {
      return null;
    }
  }

  try {
    let rawText = '';
    if (parserAdapter.mode === 'class') {
      const parserInstance = new parserAdapter.ctor({ data: buffer });
      const parsed = await parserInstance.getText();
      rawText = (parsed?.text || '').replace(/\r/g, '\n');
    } else if (parserAdapter.mode === 'function') {
      const parsed = await parserAdapter.fn(buffer);
      rawText = (parsed?.text || '').replace(/\r/g, '\n');
    } else {
      return null;
    }

    const trimmed = rawText.trim();
    if (!trimmed) {
      return null;
    }

    const lines = normalizeLines(trimmed);
    const linesWithPlain = lines.map((line) => {
      const withoutDiacritics = stripDiacritics(line);
      return {
        original: line,
        plain: withoutDiacritics.toLowerCase(),
      };
    });

    const joined = trimmed.replace(/\s+/g, ' ');

    const invoiceFromLines =
      lines
        .map((line) =>
          extractFirstMatch(line, [
            /\b([A-Z]{2,10}[-\/]\d{2,8}(?:[-\/]\d{2,4})?)\b/,
            /\b(\d{2,8}[-\/]?[A-Z]{2,10})\b/,
          ]),
        )
        .find((value) => value && /\d/.test(value));

    const invoiceNumber =
      invoiceFromLines ||
      extractFirstMatch(joined, [
        /Faktura[^A-Z0-9]{0,20}([A-Z]{2,10}[-\/]\d{2,8}(?:[-\/]\d{2,4})?)/i,
        /Invoice[^A-Z0-9]{0,20}([A-Z]{2,10}[-\/]\d{2,8}(?:[-\/]\d{2,4})?)/i,
      ]) || `TMP-${Date.now()}`;

    const issueDate =
      extractFirstMatch(joined, [
        /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/,
        /\b(20\d{2}-\d{2}-\d{2})\b/,
      ]) || null;

    const currency =
      extractFirstMatch(joined, [/\b(CZK|Kč|EUR|USD|GBP|PLN)\b/i]) || 'CZK';

    const totalWithVat =
      parseLocalizedNumber(
        extractFirstMatch(joined, [
          /Celkem\s*[:#-]?\s*([-0-9\s,]+)\s*(?:CZK|Kč|EUR|USD|GBP|PLN)?/i,
          /Total\s*[:#-]?\s*([-0-9\s,]+)\s*(?:CZK|Kč|EUR|USD|GBP|PLN)?/i,
        ]),
      ) || null;

    const supplierLine =
      linesWithPlain.find((entry) => entry.plain.startsWith('dodavatel') || entry.plain.startsWith('supplier')) ||
      linesWithPlain.find((entry) => entry.plain.includes('dodavatel') || entry.plain.includes('supplier'));
    const supplierName = supplierLine
      ? supplierLine.original.replace(/^[^:]*[:#-]?\s*/, '').trim() || supplierLine.original.trim()
      : lines[0] || 'Neznámý dodavatel';
    const cleanSupplierName = supplierName.length ? supplierName : 'Neznámý dodavatel';

    const descriptionSnippet = lines.slice(0, 25).join(' ').slice(0, 500);

    const items = [
      {
        itemName: 'Importovaná položka',
        description:
          descriptionSnippet ||
          `Obsah souboru ${filename || 'invoice.pdf'} nebyl plně analyzován.`,
        quantity: 1,
        unitPrice: totalWithVat || 0,
        totalPrice: totalWithVat || 0,
        vatRate: 0,
      },
    ];

    return {
      supplierName: cleanSupplierName,
      supplierIco: extractFirstMatch(joined, [/IČ[:\s]*([0-9]{6,10})/i]) || null,
      invoiceNumber,
      issueDate: issueDate ? toIsoDate(issueDate) : null,
      currency: mapCurrency(currency),
      totalWithoutVat: null,
      totalWithVat,
      items,
      ocrSource: 'LOCAL_FALLBACK',
    };
  } catch (error) {
    console.error('[OCR] Lokální parsování PDF selhalo:', error.message);
    return null;
  }
};

const parseInvoiceFromPages = (pages = []) => {
  if (!Array.isArray(pages) || pages.length === 0) {
    return null;
  }

  const markdown = pages.map((page) => page?.markdown || '').join('\n\n');
  if (!markdown.trim()) {
    return null;
  }

  const invoiceNumberMatch = markdown.match(/Faktura\s*-\s*Daňový\s*doklad\s*-\s*([^\s\n]+)/i);
  const supplierMatch =
    markdown.match(/\*\*Prodávající:\*\*\s*([^\n]+)/i) || markdown.match(/\*\*Seller:\*\*\s*([^\n]+)/i);
  const icoMatch = markdown.match(/IČ:\s*([0-9]{6,})/i) || markdown.match(/ICO:\s*([0-9]{6,})/i);
  const issueDateMatch =
    markdown.match(/Datum\s+vystavení:[^\d]*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i) ||
    markdown.match(/Invoice\s+date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  const currencyMatch = markdown.match(/Celkem:\s*[-0-9\s,]+\s*([A-Za-zČč€$£]+)/i);

  const tableMatch = markdown.match(
    /\|\s*K[oó]d\s*\|\s*Popis\s*\|\s*Ks\s*\|\s*Cena\s*ks\s*\|\s*bez\s*DPH\s*\|\s*DPH\s*\|\s*DPH%\s*\|\s*Cena\s*\|\s*Z[aá]ruka\s*\|([\s\S]*?)(?:\n\s*\n|$)/i,
  );

  const items = [];
  let totalWithoutVat = 0;
  let totalWithVat = 0;
  let lastItem = null;

  if (tableMatch) {
    const rows = tableMatch[1]
      .split('\n')
      .map((row) => row.trim())
      .filter((row) => row.startsWith('|'));

    for (const row of rows) {
      const cols = row.split('|').map((col) => col.trim());
      if (cols.length < 10) {
        continue;
      }

      const code = cols[1] || null;
      const description = cols[2] || null;
      const quantityValue = parseLocalizedNumber(cols[3]);
      const unitPriceValue = parseLocalizedNumber(cols[4]);
      const withoutVatValue = parseLocalizedNumber(cols[5]);
      const vatValue = parseLocalizedNumber(cols[6]);
      const vatRateValue = parseLocalizedNumber(cols[7]);
      const totalValue = parseLocalizedNumber(cols[8]);

      if (quantityValue === null) {
        if (description && lastItem) {
          lastItem.itemName = `${lastItem.itemName} ${description}`.trim();
          if (code) {
            lastItem.productCode = lastItem.productCode ? `${lastItem.productCode}/${code}` : code;
          }
        }
        continue;
      }

      const item = {
        itemName: description || code || 'Položka',
        description,
        productCode: code,
        quantity: quantityValue,
        unitPrice: unitPriceValue ?? withoutVatValue ?? totalValue ?? 0,
        totalPrice: totalValue ?? withoutVatValue ?? unitPriceValue ?? 0,
        vatRate: vatRateValue ?? null,
      };

      const referenceCode = extractReferenceProductCode(item.itemName || '', item.description || '');
      if (referenceCode) {
        item.referenceProductCode = referenceCode;
      }

      items.push(item);
      lastItem = item;

      if (withoutVatValue !== null) {
        totalWithoutVat += withoutVatValue;
      }
      if (totalValue !== null) {
        totalWithVat += totalValue;
      } else if (withoutVatValue !== null && vatValue !== null) {
        totalWithVat += withoutVatValue + vatValue;
      }
    }
  }

  if (!items.length) {
    return null;
  }

  if (totalWithoutVat === 0) {
    totalWithoutVat = items.reduce((sum, item) => {
      const unit = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
      const qty = typeof item.quantity === 'number' ? item.quantity : 0;
      return sum + unit * qty;
    }, 0);
  }

  if (totalWithVat === 0) {
    totalWithVat = items.reduce((sum, item) => {
      const total = typeof item.totalPrice === 'number' ? item.totalPrice : null;
      if (total !== null) {
        return sum + total;
      }
      const unit = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
      const qty = typeof item.quantity === 'number' ? item.quantity : 0;
      const vatRate = item.vatRate ? item.vatRate / 100 : 0;
      return sum + unit * qty * (1 + vatRate);
    }, 0);
  }

  const totalLineMatch = markdown.match(/Celkem:\s*([-0-9\s,]+)\s*[A-Za-zČč€$£]+/i);
  if (totalLineMatch) {
    const parsedTotal = parseLocalizedNumber(totalLineMatch[1]);
    if (parsedTotal !== null) {
      totalWithVat = parsedTotal;
    }
  }

  return {
    supplierName: supplierMatch ? supplierMatch[1] : 'Neznámý dodavatel',
    supplierIco: icoMatch ? icoMatch[1] : null,
    invoiceNumber: invoiceNumberMatch ? invoiceNumberMatch[1] : `TMP-${Date.now()}`,
    issueDate: issueDateMatch ? toIsoDate(issueDateMatch[1]) : null,
    currency: mapCurrency(currencyMatch ? currencyMatch[1] : 'CZK'),
    totalWithoutVat,
    totalWithVat,
    items,
  };
};

const normalizeResponse = (payload) => {
  if (!payload) {
    return parseMockInvoice();
  }

  if (Array.isArray(payload.pages) && payload.pages.length) {
    const parsed = parseInvoiceFromPages(payload.pages);
    if (parsed) {
      return parsed;
    }
  }

  const invoice = payload.invoice || payload.document || {};
  const supplier = payload.supplier || payload.vendor || invoice.supplier || {};
  const totals = payload.totals || invoice.totals || {};
  const currency = payload.currency || invoice.currency || totals.currency || 'CZK';

  const items = normalizeItems(
    payload.items || payload.line_items || invoice.items || totals.items || []
  );

  const base = {
    supplierName: supplier.name || invoice.supplierName || 'Neznámý dodavatel',
    supplierIco: supplier.ico || supplier.ic || supplier.registration || null,
    invoiceNumber: invoice.number || invoice.invoice_number || payload.invoice_number || `TMP-${Date.now()}`,
    issueDate: toIsoDate(invoice.date || invoice.issue_date || payload.issueDate || payload.date),
    currency,
    totalWithoutVat: toNumber(totals.excluding_vat || totals.net || invoice.total_ex_tax, null),
    totalWithVat: toNumber(totals.including_vat || totals.gross || invoice.total_inc_tax, null),
    items
  };

  if (!items.length) {
    const mock = parseMockInvoice('OCR nevrátilo žádné položky');
    return {
      ...base,
      items: mock.items,
      __mock: true,
      errorMessage: mock.errorMessage,
    };
  }

  return base;
};

async function callMistralOcr({ buffer, filename, mimetype }) {
  const apiKey = process.env.MISTRAL_OCR_API_KEY || process.env.MISTRAL_API_KEY;

  if (!buffer) {
    throw new Error('OCR vyžaduje binární obsah souboru.');
  }

  if (!apiKey) {
    console.warn('[OCR] MISTRAL_OCR_API_KEY není nastaven, používám lokální fallback.');
    const fallback = await attemptLocalPdfParse({ buffer, filename, mimetype });
    if (fallback) {
      return fallback;
    }
    return parseMockInvoice('MISTRAL_OCR_API_KEY není nastaven');
  }

  try {
    const uploadForm = new FormData();
    const detectedMime = mimetype || 'application/pdf';
    const blob = new Blob([buffer], { type: detectedMime });
    uploadForm.append('file', blob, filename || 'invoice.pdf');
    uploadForm.append('purpose', 'ocr');

    console.info('[OCR] Odesílám soubor do Mistral files API', {
      endpoint: DEFAULT_FILES_URL,
      filename,
      mimetype: detectedMime,
      size: buffer.length,
    });

    const uploadResponse = await fetch(DEFAULT_FILES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: uploadForm,
    });

    if (!uploadResponse.ok) {
      const text = await uploadResponse.text().catch(() => uploadResponse.statusText);
      throw new Error(`Mistral files API vrátilo chybu ${uploadResponse.status}: ${text}`);
    }

    const uploaded = await uploadResponse.json();
    console.info('[OCR] Soubor úspěšně nahrán', uploaded);

    if (!uploaded?.id) {
      throw new Error('Files API nevrátilo file_id');
    }

    const signedUrlResponse = await fetch(`${DEFAULT_FILES_URL}/${uploaded.id}/url?expiry=24`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!signedUrlResponse.ok) {
      const text = await signedUrlResponse.text().catch(() => signedUrlResponse.statusText);
      throw new Error(`Mistral files url API vrátilo chybu ${signedUrlResponse.status}: ${text}`);
    }

    const signedUrlPayload = await signedUrlResponse.json();
    if (!signedUrlPayload?.url) {
      throw new Error('Files API nevrátilo podepsaný URL');
    }

    const isImage = (detectedMime || '').startsWith('image/');
    const documentPayload = isImage
      ? { type: 'image_url', image_url: signedUrlPayload.url }
      : { type: 'document_url', document_url: signedUrlPayload.url };

    const requestPayload = {
      model: DEFAULT_OCR_MODEL,
      document: documentPayload,
    };

    if (isImage) {
      requestPayload.include_image_base64 = true;
    }

    console.info('[OCR] Odesílám požadavek do Mistral OCR', {
      endpoint: DEFAULT_OCR_URL,
      fileId: uploaded.id,
      documentType: documentPayload.type,
    });

    const response = await fetch(DEFAULT_OCR_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`OCR služba vrátila chybu ${response.status}: ${text}`);
    }

    const responsePayload = await response.json();
    console.info('[OCR] Mistral OCR úspěšně odpověděl', {
      hasInvoice: Boolean(responsePayload?.invoice || responsePayload?.document),
      items: Array.isArray(responsePayload?.items) ? responsePayload.items.length : undefined,
      pages: Array.isArray(responsePayload?.pages) ? responsePayload.pages.length : undefined,
    });
    return normalizeResponse(responsePayload);
  } catch (error) {
    console.error('[OCR] Chyba při volání Mistral OCR, zkouším lokální fallback:', error.message);
    const fallback = await attemptLocalPdfParse({ buffer, filename, mimetype });
    if (fallback) {
      return fallback;
    }
    throw error;
  }
}

async function parseInvoice({ buffer, filename, mimetype } = {}) {
  try {
    if (buffer) {
      return await callMistralOcr({ buffer, filename, mimetype });
    }
    console.warn('[OCR] Nebyl poskytnut žádný soubor, vracím mock data.');
    return parseMockInvoice('Nebyly dodány žádné OCR vstupy');
  } catch (error) {
    console.error('[OCR] Chyba při volání Mistral OCR:', error.message);
    return parseMockInvoice(error.message || 'Chyba při volání Mistral OCR');
  }
}

module.exports = {
  parseInvoice
};
