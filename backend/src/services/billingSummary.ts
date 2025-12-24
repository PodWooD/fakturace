import { PrismaClient, WorkRecord, Service, Hardware } from '@prisma/client';
import { calculateInvoiceTotals } from './invoiceTotals';
import { fromCents } from '../utils/money';

const buildWorkRecordWhere = (organizationId: number | string, month?: number | string, year?: number | string) => {
    const where: any = { organizationId: parseInt(String(organizationId), 10) };
    if (month) where.month = parseInt(String(month), 10);
    if (year) where.year = parseInt(String(year), 10);
    return where;
};

const formatWorkRecord = (record: WorkRecord, organization: any) => {
    const minutes = record.minutes || 0;
    const kilometers = record.kilometers || 0;
    const hours = minutes / 60;
    const hourlyRateCents = organization.hourlyRateCents || 0;
    const kilometerRateCents = organization.kilometerRateCents || 0;

    const hourlyAmountCents = Math.round(hours * hourlyRateCents);
    const kmAmountCents = kilometers * kilometerRateCents;

    return {
        id: record.id,
        date: record.date,
        worker: record.worker,
        description: record.description,
        minutes: record.minutes,
        hours: Number(hours.toFixed(2)),
        kilometers,
        hourlyAmountCents,
        hourlyAmount: fromCents(hourlyAmountCents),
        kmAmountCents,
        kmAmount: fromCents(kmAmountCents),
        projectCode: record.projectCode,
        branch: record.branch,
        timeFrom: record.timeFrom,
        timeTo: record.timeTo,
        status: record.status,
    };
};

const mapService = (service: Service) => ({
    id: service.id,
    serviceName: service.serviceName,
    description: service.description,
    monthlyPriceCents: service.monthlyPriceCents,
    monthlyPrice: fromCents(service.monthlyPriceCents),
    isActive: service.isActive,
});

const mapHardware = (item: any) => ({
    id: item.id,
    itemName: item.itemName,
    description: item.description,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    unitPrice: fromCents(item.unitPriceCents),
    totalPriceCents: item.totalPriceCents,
    totalPrice: fromCents(item.totalPriceCents),
    vatRate: item.vatRate,
    month: item.month,
    year: item.year,
    status: item.status,
    supplier: item.sourceInvoiceItem?.invoice?.supplierName || null,
    invoiceNumber: item.sourceInvoiceItem?.invoice?.invoiceNumber || null,
    sourceInvoiceItemId: item.sourceInvoiceItemId,
});

export async function getBillingSummary(
    prisma: PrismaClient,
    organizationId: string | number,
    month: string | number,
    year: string | number
) {
    const resolvedOrgId = parseInt(String(organizationId), 10);
    const resolvedMonth = parseInt(String(month), 10);
    const resolvedYear = parseInt(String(year), 10);

    const organization = await prisma.organization.findUnique({
        where: { id: resolvedOrgId },
    });

    if (!organization) {
        return null;
    }

    const workRecords = await prisma.workRecord.findMany({
        where: buildWorkRecordWhere(resolvedOrgId, resolvedMonth, resolvedYear),
        orderBy: [
            { date: 'asc' },
            { id: 'asc' },
        ],
    });

    const services = await prisma.service.findMany({
        where: { organizationId: resolvedOrgId, isActive: true },
        orderBy: [{ serviceName: 'asc' }],
    });

    const hardware = await prisma.hardware.findMany({
        where: {
            organizationId: resolvedOrgId,
            month: resolvedMonth,
            year: resolvedYear,
        },
        include: {
            sourceInvoiceItem: {
                include: {
                    invoice: true,
                },
            },
        },
        orderBy: [{ itemName: 'asc' }],
    });

    const totals = calculateInvoiceTotals(
        organization,
        workRecords,
        services,
        hardware,
    );

    const formattedWorkRecords = workRecords.map((record) =>
        formatWorkRecord(record, organization),
    );

    const workSummary = formattedWorkRecords.reduce(
        (acc, record) => {
            acc.totalMinutes += record.minutes || 0;
            acc.totalHours += record.hours;
            acc.hourlyAmountCents += record.hourlyAmountCents;
            acc.hourlyAmount = fromCents(acc.hourlyAmountCents);
            acc.totalKm += record.kilometers || 0;
            acc.kmAmountCents += record.kmAmountCents;
            acc.kmAmount = fromCents(acc.kmAmountCents);
            return acc;
        },
        {
            totalMinutes: 0,
            totalHours: 0,
            totalKm: 0,
            hourlyAmountCents: 0,
            hourlyAmount: 0,
            kmAmountCents: 0,
            kmAmount: 0,
        } as any
    );

    workSummary.totalHours = Number(workSummary.totalHours.toFixed(2));

    const mappedServices = services.map(mapService);
    const mappedHardware = hardware.map(mapHardware);

    return {
        organization: {
            id: organization.id,
            name: organization.name,
            code: organization.code,
            hourlyRateCents: organization.hourlyRateCents,
            hourlyRate: fromCents(organization.hourlyRateCents),
            kilometerRateCents: organization.kilometerRateCents,
            kilometerRate: fromCents(organization.kilometerRateCents),
            hardwareMarginPct: organization.hardwareMarginPct,
            softwareMarginPct: organization.softwareMarginPct,
            outsourcingFeeCents: organization.outsourcingFeeCents,
            outsourcingFee: fromCents(organization.outsourcingFeeCents),
        },
        period: {
            month: resolvedMonth,
            year: resolvedYear,
        },
        services: mappedServices,
        work: {
            entries: formattedWorkRecords,
            summary: workSummary,
        },
        hardware: mappedHardware,
        totals,
    };
}
