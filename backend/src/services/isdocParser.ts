import { parseStringPromise } from 'xml2js';

const ensureArray = (value: any) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
};

const toNumber = (value: any, fallback: number | null = null) => {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const safeGet = (object: any, path: (string | number)[], fallback: any = null) => {
    return (
        path.reduce((acc, key) => {
            if (acc === null || acc === undefined) {
                return null;
            }
            if (typeof key === 'number') {
                return Array.isArray(acc) ? acc[key] : null;
            }
            if (typeof acc === 'object' && key in acc) {
                return acc[key];
            }
            return null;
        }, object) ?? fallback
    );
};

const normalizeItem = (id: number, node: any = {}) => {
    const name =
        safeGet(node, ['cbc:Name', 0, '_']) || safeGet(node, ['cbc:Name', 0]) || `Položka ${id + 1}`;
    const description =
        safeGet(node, ['cbc:Description', 0, '_']) || safeGet(node, ['cbc:Description', 0]) || null;
    const quantity = toNumber(safeGet(node, ['cbc:InvoicedQuantity', 0, '_']), 1) ?? 1;
    const unitPrice = toNumber(
        safeGet(node, ['cac:Price', 0, 'cbc:PriceAmount', 0, '_']),
        null
    );
    const totalPrice = toNumber(
        safeGet(node, ['cbc:LineExtensionAmount', 0, '_']),
        unitPrice ? unitPrice * quantity : null
    );
    const vatRate = toNumber(
        safeGet(node, [
            'cac:TaxTotal',
            0,
            'cac:TaxSubtotal',
            0,
            'cac:TaxCategory',
            0,
            'cbc:Percent',
            0,
            '_',
        ]),
        null
    );

    return {
        itemName: name,
        description,
        quantity,
        unitPrice,
        totalPrice,
        vatRate,
    };
};

const normalizeInvoice = (payload: any = {}) => {
    const supplier = safeGet(payload, ['cac:AccountingSupplierParty', 0, 'cac:Party', 0]) || {};
    const supplierName =
        safeGet(supplier, ['cac:PartyName', 0, 'cbc:Name', 0, '_']) ||
        safeGet(supplier, ['cbc:Name', 0]) ||
        'Neznámý dodavatel';
    const supplierIco =
        safeGet(supplier, ['cac:PartyIdentification', 0, 'cbc:ID', 0, '_']) || null;
    const invoiceNumber =
        safeGet(payload, ['cbc:ID', 0, '_']) ||
        safeGet(payload, ['cbc:ID', 0]) ||
        `ISDOC-${Date.now()}`;
    const issueDate = safeGet(payload, ['cbc:IssueDate', 0]) || null;
    const currency =
        safeGet(payload, ['cbc:DocumentCurrencyCode', 0, '_']) ||
        safeGet(payload, ['cbc:DocumentCurrencyCode', 0]) ||
        'CZK';
    const totalsNode = safeGet(payload, ['cac:LegalMonetaryTotal', 0]) || {};
    const totalWithoutVat = toNumber(
        safeGet(totalsNode, ['cbc:TaxExclusiveAmount', 0, '_']),
        null
    );
    const totalWithVat = toNumber(
        safeGet(totalsNode, ['cbc:TaxInclusiveAmount', 0, '_']),
        null
    );

    const lines = ensureArray(safeGet(payload, ['cac:InvoiceLine'])) || [];
    const items = lines.map((line: any, index: number) => normalizeItem(index, line));

    return {
        supplierName,
        supplierIco,
        invoiceNumber,
        issueDate,
        currency,
        totalWithoutVat,
        totalWithVat,
        items,
    };
};

export async function parseIsdoc(buffer: Buffer) {
    if (!buffer) {
        throw new Error('ISDOC parser vyžaduje obsah souboru.');
    }

    const text = buffer.toString('utf8');
    const parsed = await parseStringPromise(text, {
        tagNameProcessors: [(name) => name],
        explicitArray: true,
        mergeAttrs: true,
        attrNameProcessors: [(name) => name],
    });

    const invoice =
        parsed?.['Invoice']?.[0] ||
        parsed?.['isdoc:Invoice']?.[0] ||
        parsed?.['Invoice-ISDOC']?.[0] ||
        parsed?.['isdoc:Invoice-ISDOC']?.[0];

    if (!invoice) {
        throw new Error('Soubor neobsahuje platnou ISDOC fakturu.');
    }

    return normalizeInvoice(invoice);
}
