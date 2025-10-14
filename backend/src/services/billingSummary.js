const { calculateInvoiceTotals } = require('./invoiceTotals');

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildWorkRecordWhere = (organizationId, month, year) => {
  const where = { organizationId: parseInt(organizationId, 10) };
  if (month) where.month = parseInt(month, 10);
  if (year) where.year = parseInt(year, 10);
  return where;
};

const formatWorkRecord = (record, hourlyRate, kmRate) => {
  const hours = (record.minutes || 0) / 60;
  const hourlyAmount = hours * toNumber(hourlyRate);
  const kmAmount = toNumber(record.kilometers) * toNumber(kmRate);

  return {
    id: record.id,
    date: record.date,
    worker: record.worker,
    description: record.description,
    minutes: record.minutes,
    hours: Number(hours.toFixed(2)),
    kilometers: record.kilometers,
    hourlyAmount: Number(hourlyAmount.toFixed(2)),
    kmAmount: Number(kmAmount.toFixed(2)),
    projectCode: record.projectCode,
    branch: record.branch,
    timeFrom: record.timeFrom,
    timeTo: record.timeTo
  };
};

async function getBillingSummary(prisma, organizationId, month, year) {
  const resolvedOrgId = parseInt(organizationId, 10);
  const resolvedMonth = parseInt(month, 10);
  const resolvedYear = parseInt(year, 10);

  const organization = await prisma.organization.findUnique({
    where: { id: resolvedOrgId }
  });

  if (!organization) {
    return null;
  }

  const workRecords = await prisma.workRecord.findMany({
    where: buildWorkRecordWhere(resolvedOrgId, resolvedMonth, resolvedYear),
    orderBy: [{ date: 'asc' }, { id: 'asc' }]
  });

  const services = await prisma.service.findMany({
    where: { organizationId: resolvedOrgId, isActive: true },
    orderBy: [{ serviceName: 'asc' }]
  });

  const hardware = await prisma.hardware.findMany({
    where: {
      organizationId: resolvedOrgId,
      month: resolvedMonth,
      year: resolvedYear
    },
    include: {
      invoiceItem: {
        include: {
          invoice: true
        }
      }
    },
    orderBy: [{ itemName: 'asc' }]
  });

  const totals = calculateInvoiceTotals(
    organization,
    workRecords,
    services,
    hardware
  );

  const formattedWorkRecords = workRecords.map((record) =>
    formatWorkRecord(record, organization.hourlyRate, organization.kmRate)
  );

  const workSummary = formattedWorkRecords.reduce(
    (acc, record) => {
      acc.totalMinutes += record.minutes || 0;
      acc.totalHours += record.hours;
      acc.totalKm += record.kilometers || 0;
      acc.hourlyAmount += record.hourlyAmount;
      acc.kmAmount += record.kmAmount;
      return acc;
    },
    {
      totalMinutes: 0,
      totalHours: 0,
      totalKm: 0,
      hourlyAmount: 0,
      kmAmount: 0
    }
  );

  workSummary.totalHours = Number(workSummary.totalHours.toFixed(2));
  workSummary.hourlyAmount = Number(workSummary.hourlyAmount.toFixed(2));
  workSummary.kmAmount = Number(workSummary.kmAmount.toFixed(2));

  const serviceSummary = services.reduce(
    (acc, service) => acc + toNumber(service.monthlyPrice),
    0
  );

  const hardwareSummary = hardware.reduce(
    (acc, item) => acc + toNumber(item.totalPrice),
    0
  );

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      code: organization.code,
      hourlyRate: Number(organization.hourlyRate),
      kmRate: Number(organization.kmRate)
    },
    period: {
      month: resolvedMonth,
      year: resolvedYear
    },
    services: services.map((service) => ({
      id: service.id,
      serviceName: service.serviceName,
      description: service.description,
      monthlyPrice: Number(service.monthlyPrice),
      isActive: service.isActive
    })),
    work: {
      entries: formattedWorkRecords,
      summary: workSummary
    },
    hardware: hardware.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      description: item.description,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
      month: item.month,
      year: item.year,
      status: item.status,
      supplier: item.invoiceItem?.invoice?.supplierName || null,
      invoiceNumber: item.invoiceItem?.invoice?.invoiceNumber || null,
      sourceInvoiceItemId: item.sourceInvoiceItemId
    })),
    software: [],
    totals
  };
}

module.exports = {
  getBillingSummary
};
