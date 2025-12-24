import { fromCents } from '../utils/money';

export const DEFAULT_VAT_RATE = 0.21;

export const roundCurrency = (value: number | string): number =>
    Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const toInt = (value: unknown): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
};

interface Organization {
    hourlyRateCents?: number;
    kilometerRateCents?: number;
    [key: string]: any;
}

interface WorkRecord {
    minutes?: number;
    kilometers?: number;
    [key: string]: any;
}

interface Service {
    monthlyPriceCents?: number;
    isActive?: boolean;
    [key: string]: any;
}

interface Hardware {
    quantity?: number;
    unitPriceCents?: number;
    totalPriceCents?: number;
    [key: string]: any;
}

export interface InvoiceTotals {
    workAmountCents: number;
    workAmount: number | null;
    kmAmountCents: number;
    kmAmount: number | null;
    servicesAmountCents: number;
    servicesAmount: number | null;
    hardwareAmountCents: number;
    hardwareAmount: number | null;
    totalAmountCents: number;
    totalAmount: number | null;
    totalVatCents: number;
    totalVat: number | null;
    totalWithVatCents: number;
    totalWithVat: number | null;
}

export const calculateInvoiceTotals = (
    organization: Organization = {},
    workRecords: WorkRecord[] = [],
    services: Service[] = [],
    hardware: Hardware[] = [],
    vatRate: number | string = DEFAULT_VAT_RATE,
): InvoiceTotals => {
    const hourlyRateCents = organization.hourlyRateCents || 0;
    const kilometerRateCents = organization.kilometerRateCents || 0;

    const workAmountCents = workRecords.reduce((sum, record) => {
        const minutes = toInt(record?.minutes);
        const hours = minutes / 60;
        return sum + Math.round(hours * hourlyRateCents);
    }, 0);

    const kmAmountCents = workRecords.reduce((sum, record) => {
        const kilometers = toInt(record?.kilometers);
        return sum + kilometers * kilometerRateCents;
    }, 0);

    const servicesAmountCents = services.reduce((sum, service) => {
        if (service?.isActive === false) {
            return sum;
        }
        return sum + (service?.monthlyPriceCents || 0);
    }, 0);

    const hardwareAmountCents = hardware.reduce((sum, item) => {
        if (item?.totalPriceCents) {
            return sum + item.totalPriceCents;
        }

        const quantity = toInt(item?.quantity) || 1;
        const unitPriceCents = item?.unitPriceCents || 0;
        return sum + unitPriceCents * quantity;
    }, 0);

    const totalAmountCents =
        workAmountCents + kmAmountCents + servicesAmountCents + hardwareAmountCents;

    const effectiveVatRate = Number.isFinite(Number(vatRate))
        ? Number(vatRate)
        : DEFAULT_VAT_RATE;

    const totalVatCents = Math.round(totalAmountCents * effectiveVatRate);
    const totalWithVatCents = totalAmountCents + totalVatCents;

    return {
        workAmountCents,
        workAmount: fromCents(workAmountCents),
        kmAmountCents,
        kmAmount: fromCents(kmAmountCents),
        servicesAmountCents,
        servicesAmount: fromCents(servicesAmountCents),
        hardwareAmountCents,
        hardwareAmount: fromCents(hardwareAmountCents),
        totalAmountCents,
        totalAmount: fromCents(totalAmountCents),
        totalVatCents,
        totalVat: fromCents(totalVatCents),
        totalWithVatCents,
        totalWithVat: fromCents(totalWithVatCents),
    };
};
