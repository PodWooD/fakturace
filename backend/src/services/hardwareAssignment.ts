import {
    PrismaClient,
    HardwareStatus,
    ReceivedInvoiceItemStatus,
} from '@prisma/client';
import { normalizeNumber } from '../utils/money';
import { assertPeriodUnlocked } from '../utils/accounting';

export class AssignmentError extends Error {
    statusCode: number;
    code: string;

    constructor(message: string, statusCode = 400, code = 'ASSIGNMENT_ERROR') {
        super(message);
        this.name = 'AssignmentError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

const parseIntOrNull = (value: string | number | undefined | null): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = parseInt(String(value), 10);
    return Number.isNaN(parsed) ? null : parsed;
};

interface AssignInvoiceItemParams {
    prisma: PrismaClient;
    itemId: number;
    organizationId: string | number;
    month: string | number;
    year: string | number;
    status?: string;
}

export async function assignInvoiceItem({
    prisma,
    itemId,
    organizationId,
    month,
    year,
    status,
}: AssignInvoiceItemParams) {
    const parsedOrganizationId = parseIntOrNull(organizationId);
    const parsedMonth = parseIntOrNull(month);
    const parsedYear = parseIntOrNull(year);

    if (!parsedOrganizationId || !parsedMonth || !parsedYear) {
        throw new AssignmentError(
            'organizationId, month a year jsou povinné parametry',
            400,
            'MISSING_FIELDS',
        );
    }

    await assertPeriodUnlocked(prisma, {
        month: parsedMonth,
        year: parsedYear,
    });

    const item = await prisma.receivedInvoiceItem.findUnique({
        where: { id: itemId },
        include: { hardware: true },
    });

    if (!item) {
        throw new AssignmentError('Položka nenalezena', 404, 'ITEM_NOT_FOUND');
    }

    if (item.hardware) {
        throw new AssignmentError('Položka už byla přiřazena', 400, 'ALREADY_ASSIGNED');
    }

    const quantity = normalizeNumber(item.quantity ? item.quantity.toString() : null) || 1;
    const roundedQuantity = Math.max(Math.round(quantity), 1);
    const unitPriceCents =
        item.unitPriceCents ||
        Math.round((item.totalPriceCents || 0) / (quantity || 1)) ||
        0;
    const totalPriceCents = item.totalPriceCents || unitPriceCents * roundedQuantity;

    const validStatus = status && (status in HardwareStatus)
        ? (status as HardwareStatus)
        : HardwareStatus.ASSIGNED;

    const hardware = await prisma.hardware.create({
        data: {
            organizationId: parsedOrganizationId,
            itemName: item.itemName,
            description: item.description,
            quantity: roundedQuantity,
            unitPriceCents,
            totalPriceCents,
            vatRate: item.vatRate || 0,
            month: parsedMonth,
            year: parsedYear,
            status: validStatus,
            assignedAt: new Date(),
            sourceInvoiceItemId: item.id,
        },
    });

    const updatedItem = await prisma.receivedInvoiceItem.update({
        where: { id: itemId },
        data: {
            status: ReceivedInvoiceItemStatus.ASSIGNED,
            assignedOrganizationId: parsedOrganizationId,
            assignedMonth: parsedMonth,
            assignedYear: parsedYear,
        },
    });

    return {
        hardware,
        updatedItem,
        originalItem: item,
    };
}
