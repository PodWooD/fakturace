import { PrismaClient, Invoice, Organization, Service, Hardware, WorkRecord, InvoiceStatus } from '@prisma/client';
import { fromCents } from '../utils/money';
import { calculateInvoiceTotals, InvoiceTotals } from './invoiceTotals';

export interface MappedInvoice extends Invoice {
    totalAmount: number | null;
    totalVat: number | null;
}

export interface MappedOrganization extends Organization {
    hourlyRate: number | null;
    kilometerRate: number | null;
    outsourcingFee: number | null;
}

export interface MappedService extends Service {
    monthlyPrice: number | null;
}

export interface MappedHardware extends Hardware {
    unitPrice: number | null;
    totalPrice: number | null;
}

export const mapOrganization = (organization: Organization): MappedOrganization => ({
    ...organization,
    hourlyRate: fromCents(organization.hourlyRateCents),
    kilometerRate: fromCents(organization.kilometerRateCents),
    outsourcingFee: fromCents(organization.outsourcingFeeCents),
});

export const mapService = (service: Service): MappedService => ({
    ...service,
    monthlyPrice: fromCents(service.monthlyPriceCents),
});

export const mapHardware = (item: Hardware): MappedHardware => ({
    ...item,
    unitPrice: fromCents(item.unitPriceCents),
    totalPrice: fromCents(item.totalPriceCents),
});

export const mapInvoice = (invoice: Invoice): MappedInvoice => ({
    ...invoice,
    totalAmount: fromCents(invoice.totalAmountCents),
    totalVat: fromCents(invoice.totalVatCents),
});

export const generateInvoiceNumber = async (prisma: PrismaClient, year: number, month: number): Promise<string> => {
    const lastInvoice = await prisma.invoice.findFirst({
        where: { year },
        orderBy: { invoiceNumber: 'desc' },
    });

    if (!lastInvoice) {
        return `${year}${String(month).padStart(2, '0')}0001`;
    }

    const lastSequence = parseInt(lastInvoice.invoiceNumber.slice(-4), 10);
    return `${year}${String(month).padStart(2, '0')}${String(lastSequence + 1).padStart(4, '0')}`;
};

const buildWorkRecordWhere = (organizationId: number, month: number, year: number, includeWorkplace: boolean = false) => ({
    OR: [
        {
            billingOrgId: organizationId,
            month,
            year,
        },
        {
            billingOrgId: null,
            organizationId,
            month,
            year,
        },
    ],
});

export interface InvoiceDataPayload {
    organization: MappedOrganization;
    workRecords: WorkRecord[];
    services: MappedService[];
    hardware: MappedHardware[];
    totals: InvoiceTotals;
    month: number;
    year: number;
}

export const collectInvoiceData = async (
    prisma: PrismaClient,
    organizationId: number,
    month: number,
    year: number,
    options: { includeWorkplace?: boolean } = {}
): Promise<InvoiceDataPayload | null> => {
    const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
    });

    if (!organization) {
        return null;
    }

    const [workRecords, servicesRaw, hardwareRaw] = await Promise.all([
        prisma.workRecord.findMany({
            where: buildWorkRecordWhere(organizationId, month, year, options.includeWorkplace),
            include: options.includeWorkplace
                ? {
                    organization: true,
                    billingOrg: true,
                }
                : undefined,
            orderBy: { date: 'asc' },
        }),
        prisma.service.findMany({
            where: {
                organizationId: organizationId,
                isActive: true,
            },
        }),
        prisma.hardware.findMany({
            where: {
                organizationId: organizationId,
                month,
                year,
            },
        }),
    ]);

    const services = servicesRaw.map(mapService);
    const hardware = hardwareRaw.map(mapHardware);

    const totals = calculateInvoiceTotals(organization, workRecords, services, hardware);

    return {
        organization: mapOrganization(organization),
        workRecords,
        services,
        hardware,
        totals,
        month,
        year,
    };
};

export interface FullInvoiceData extends InvoiceDataPayload {
    invoice: MappedInvoice;
}

export const getInvoiceWithData = async (prisma: PrismaClient, invoiceId: number): Promise<FullInvoiceData | null> => {
    const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
            organization: true,
        },
    });

    if (!invoice) {
        return null;
    }

    const { organization } = invoice;
    const month = invoice.month;
    const year = invoice.year;

    const [workRecords, servicesRaw, hardwareRaw] = await Promise.all([
        prisma.workRecord.findMany({
            where: buildWorkRecordWhere(invoice.organizationId, month, year),
            orderBy: { date: 'asc' },
        }),
        prisma.service.findMany({
            where: {
                organizationId: invoice.organizationId,
                isActive: true,
            },
        }),
        prisma.hardware.findMany({
            where: {
                organizationId: invoice.organizationId,
                month,
                year,
            },
        }),
    ]);

    const services = servicesRaw.map(mapService);
    const hardware = hardwareRaw.map(mapHardware);
    const totals = calculateInvoiceTotals(organization, workRecords, services, hardware);

    return {
        invoice: mapInvoice(invoice),
        organization: mapOrganization(organization),
        workRecords,
        services,
        hardware,
        totals,
        month,
        year,
    };
};
