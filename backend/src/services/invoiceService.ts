import { PrismaClient, Currency, ReceivedInvoice, ReceivedInvoiceItem, Prisma, ReceivedInvoiceItemStatus, ReceivedInvoiceStatus } from '@prisma/client';
import crypto from 'crypto';
import { normalizeNumber, toCents, fromCents } from '../utils/money';

const OCR_MAX_ATTEMPTS = parseInt(process.env.OCR_MAX_ATTEMPTS || '3', 10);

export const determineCurrency = (value: string | undefined): Currency => {
    if (!value) {
        return Currency.CZK;
    }
    const upper = value.toUpperCase();
    return (Currency as any)[upper] ? (Currency as any)[upper] : Currency.CZK;
};

export const serializeQuantity = (value: any): string | null => {
    const numeric = normalizeNumber(value);
    if (numeric === null) {
        return null;
    }
    return numeric.toString();
};

export const computeDigest = (payload: any): string => {
    const hash = crypto.createHash('sha256');
    hash.update((payload.supplierName || '').toLowerCase());
    hash.update('|');
    hash.update((payload.invoiceNumber || '').toLowerCase());
    hash.update('|');
    hash.update(payload.issueDate ? new Date(payload.issueDate).toISOString() : '');
    hash.update('|');
    hash.update(String(payload.totalWithVat ?? payload.totalWithVatCents ?? ''));
    return hash.digest('hex');
};

export const mapInvoiceItem = (item: any) => ({
    ...item,
    unitPrice: fromCents(item.unitPriceCents),
    totalPrice: fromCents(item.totalPriceCents),
});

export const mapInvoice = (invoice: any) => ({
    ...invoice,
    totalWithoutVat: fromCents(invoice.totalWithoutVatCents),
    totalWithVat: fromCents(invoice.totalWithVatCents),
    items: invoice.items ? invoice.items.map(mapInvoiceItem) : [],
});

export const ensureDigestUnique = async (prisma: PrismaClient, digest: string) => {
    return prisma.receivedInvoice.findUnique({
        where: { digest },
        include: {
            items: true,
        },
    });
};

export const buildInvoiceData = (payload: any, userId?: number) => {
    const totalWithoutVatCents = toCents(payload.totalWithoutVat ?? payload.totalWithoutVatCents);
    const totalWithVatCents = toCents(payload.totalWithVat ?? payload.totalWithVatCents);

    return {
        supplierName: payload.supplierName || 'Neznámý dodavatel',
        supplierIco: payload.supplierIco || null,
        invoiceNumber: payload.invoiceNumber || `TEMP-${Date.now()}`,
        issueDate: payload.issueDate ? new Date(payload.issueDate) : null,
        totalWithoutVatCents,
        totalWithVatCents,
        currency: determineCurrency(payload.currency),
        digest: computeDigest(payload),
        status: ReceivedInvoiceStatus.PENDING,
        sourceFilePath: payload.sourceFilePath || null,
        ocrPayload: payload,
        createdBy: userId || null,
        ocrStatus: undefined as string | undefined, // Added for type compatibility
        ocrError: null as string | null, // Added for type compatibility
    };
};

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

export const buildInvoiceItems = (payloadItems: any[]): Prisma.ReceivedInvoiceItemCreateWithoutInvoiceInput[] => {
    const itemsData: Prisma.ReceivedInvoiceItemCreateWithoutInvoiceInput[] = [];

    (Array.isArray(payloadItems) ? payloadItems : []).forEach((item) => {
        const quantityRaw = normalizeNumber(item.quantity);
        const normalizedQuantity =
            quantityRaw !== null && Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;

        let unitPriceCents = toCents(item.unitPrice ?? item.unitPriceCents);
        let totalPriceCents =
            item.totalPrice !== undefined || item.totalPriceCents !== undefined
                ? toCents(item.totalPrice ?? item.totalPriceCents)
                : null;

        if (unitPriceCents === null && totalPriceCents !== null && normalizedQuantity) {
            unitPriceCents = Math.floor(totalPriceCents / normalizedQuantity);
        }

        if (totalPriceCents === null && unitPriceCents !== null) {
            totalPriceCents = unitPriceCents * (normalizedQuantity || 1);
        }

        if (unitPriceCents === null) {
            unitPriceCents =
                totalPriceCents !== null && normalizedQuantity
                    ? Math.floor(totalPriceCents / normalizedQuantity)
                    : 0;
        }
        if (totalPriceCents === null) {
            totalPriceCents = unitPriceCents * (normalizedQuantity || 1);
        }

        const vatRate = item.vatRate !== undefined ? parseInt(item.vatRate, 10) : 0;
        const baseName = item.itemName || 'Neuvedená položka';
        const linkedCode =
            item.referenceProductCode ||
            extractReferenceProductCode(item.itemName || '', item.description || '');

        const baseEntry = {
            itemName: baseName,
            description: item.description || null,
            productCode: item.productCode || null,
            referenceProductCode: linkedCode || null,
            unitPriceCents: unitPriceCents || 0,
            totalPriceCents: totalPriceCents || 0,
            vatRate,
            status: ReceivedInvoiceItemStatus.PENDING,
        };

        const totalUnits = Math.max(1, Math.round(normalizedQuantity));
        const canSplit =
            totalUnits > 1 && Math.abs(totalUnits - normalizedQuantity) < 1e-6 && totalPriceCents !== null;

        if (!canSplit) {
            itemsData.push({
                ...baseEntry,
                quantity: new Prisma.Decimal(normalizedQuantity),
            });
            return;
        }

        const baseUnitPrice = Math.floor((totalPriceCents || 0) / totalUnits);
        let remainder = (totalPriceCents || 0) - baseUnitPrice * totalUnits;

        for (let index = 0; index < totalUnits; index += 1) {
            const price = baseUnitPrice + (index < remainder ? 1 : 0);
            itemsData.push({
                ...baseEntry,
                itemName: `${baseName} (${index + 1}/${totalUnits})`,
                quantity: new Prisma.Decimal(1),
                unitPriceCents: price,
                totalPriceCents: price,
                referenceProductCode: linkedCode || null,
            });
        }
    });

    return itemsData;
};
