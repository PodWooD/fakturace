const express = require('express');

const router = express.Router();
const { PrismaClient, InvoiceStatus, RoundingMode } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { authorize } = authMiddleware;
const PohodaExport = require('../services/pohodaExport');
const storageService = require('../services/storageService');
const { generateInvoicePdf, getPdfQueueStats } = require('../queues/pdfQueue');
const { generatePohodaXml, getPohodaQueueStats } = require('../queues/pohodaQueue');
const { generateIsdoc, getIsdocQueueStats } = require('../queues/isdocQueue');
const { calculateInvoiceTotals } = require('../services/invoiceTotals');
const { assertPeriodUnlocked } = require('../utils/accounting');
const { fromCents } = require('../utils/money');

const prisma = new PrismaClient();
const pohodaExport = new PohodaExport();

const buildWorkRecordWhere = (organizationId, month, year) => ({
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

const mapOrganization = (organization) => ({
  ...organization,
  hourlyRate: fromCents(organization.hourlyRateCents),
  kilometerRate: fromCents(organization.kilometerRateCents),
  outsourcingFee: fromCents(organization.outsourcingFeeCents),
});

const mapService = (service) => ({
  ...service,
  monthlyPrice: fromCents(service.monthlyPriceCents),
});

const mapHardware = (item) => ({
  ...item,
  unitPrice: fromCents(item.unitPriceCents),
  totalPrice: fromCents(item.totalPriceCents),
});

const mapInvoice = (invoice) => ({
  ...invoice,
  totalAmount: fromCents(invoice.totalAmountCents),
  totalVat: fromCents(invoice.totalVatCents),
});

const collectInvoiceData = async (organizationId, month, year, { includeWorkplace = false } = {}) => {
  const resolvedOrgId = parseInt(organizationId, 10);
  const resolvedMonth = parseInt(month, 10);
  const resolvedYear = parseInt(year, 10);

  const organization = await prisma.organization.findUnique({
    where: { id: resolvedOrgId },
  });

  if (!organization) {
    return null;
  }

  const [workRecords, servicesRaw, hardwareRaw] = await Promise.all([
    prisma.workRecord.findMany({
      where: buildWorkRecordWhere(resolvedOrgId, resolvedMonth, resolvedYear),
      include: includeWorkplace
        ? {
            organization: true,
            billingOrg: true,
          }
        : undefined,
      orderBy: { date: 'asc' },
    }),
    prisma.service.findMany({
      where: {
        organizationId: resolvedOrgId,
        isActive: true,
      },
    }),
    prisma.hardware.findMany({
      where: {
        organizationId: resolvedOrgId,
        month: resolvedMonth,
        year: resolvedYear,
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
    month: resolvedMonth,
    year: resolvedYear,
  };
};

const generateInvoiceNumber = async (year, month) => {
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

const getInvoiceWithData = async (invoiceId) => {
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
  };
};

// GET faktury s filtrováním
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { month, year, organizationId, status, page = 1, limit = 20 } = req.query;

    const where = {};
    if (month) where.month = parseInt(month, 10);
    if (year) where.year = parseInt(year, 10);
    if (organizationId) where.organizationId = parseInt(organizationId, 10);
    if (status) where.status = status;

    const total = await prisma.invoice.count({ where });

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
            ico: true,
            dic: true,
          },
        },
      },
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
        { invoiceNumber: 'desc' },
      ],
      skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
      take: parseInt(limit, 10),
    });

    res.json({
      data: invoices.map(mapInvoice),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Chyba při načítání faktur' });
  }
});

// GET detail faktury
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const payload = await getInvoiceWithData(parseInt(req.params.id, 10));

    if (!payload) {
      return res.status(404).json({ error: 'Faktura nenalezena' });
    }

    res.json(payload);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Chyba při načítání faktury' });
  }
});

// POST preview faktury (bez vytvoření)
router.post('/preview', authMiddleware, authorize('invoices:generate'), async (req, res) => {
  try {
    const { organizationId, month, year } = req.body;

    if (!organizationId || !month || !year) {
      return res.status(400).json({
        error: 'Organizace, měsíc a rok jsou povinné',
      });
    }

    const payload = await collectInvoiceData(organizationId, month, year, { includeWorkplace: true });

    if (!payload) {
      return res.status(404).json({ error: 'Organizace nenalezena' });
    }

    res.json({
      organization: payload.organization,
      month: payload.month,
      year: payload.year,
      workRecords: payload.workRecords,
      services: payload.services,
      hardware: payload.hardware,
      totals: payload.totals,
    });
  } catch (error) {
    console.error('Error creating invoice preview:', error);
    res.status(500).json({ error: 'Chyba při vytváření náhledu faktury' });
  }
});

// POST generování faktury
router.post('/generate', authMiddleware, authorize('invoices:generate'), async (req, res) => {
  try {
    const { organizationId, month, year, roundingMode = RoundingMode.HALF_UP } = req.body;

    if (!organizationId || !month || !year) {
      return res.status(400).json({
        error: 'Organizace, měsíc a rok jsou povinné',
      });
    }

    const resolvedOrgId = parseInt(organizationId, 10);
    const resolvedMonth = parseInt(month, 10);
    const resolvedYear = parseInt(year, 10);

    await assertPeriodUnlocked(prisma, { month: resolvedMonth, year: resolvedYear });

    const existing = await prisma.invoice.findFirst({
      where: {
        organizationId: resolvedOrgId,
        month: resolvedMonth,
        year: resolvedYear,
      },
    });

    if (existing) {
      return res.status(400).json({
        error: 'Faktura pro tuto organizaci a období již existuje',
      });
    }

    const payload = await collectInvoiceData(resolvedOrgId, resolvedMonth, resolvedYear);

    if (!payload) {
      return res.status(404).json({ error: 'Organizace nenalezena' });
    }

    const { organization, workRecords, services, hardware, totals } = payload;
    const invoiceNumber = await generateInvoiceNumber(resolvedYear, resolvedMonth);

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: resolvedOrgId,
        invoiceNumber,
        month: resolvedMonth,
        year: resolvedYear,
        totalAmountCents: totals.totalAmountCents,
        totalVatCents: totals.totalVatCents,
        roundingMode,
        status: InvoiceStatus.DRAFT,
        generatedAt: new Date(),
      },
      include: {
        organization: true,
      },
    });

    res.status(201).json({
      invoice: mapInvoice(invoice),
      breakdown: {
        workAmountCents: totals.workAmountCents,
        workAmount: totals.workAmount,
        kmAmountCents: totals.kmAmountCents,
        kmAmount: totals.kmAmount,
        servicesAmountCents: totals.servicesAmountCents,
        servicesAmount: totals.servicesAmount,
        hardwareAmountCents: totals.hardwareAmountCents,
        hardwareAmount: totals.hardwareAmount,
        workRecordsCount: workRecords.length,
        servicesCount: services.length,
        hardwareCount: hardware.length,
      },
      totals: {
        totalAmountCents: totals.totalAmountCents,
        totalAmount: totals.totalAmount,
        totalVatCents: totals.totalVatCents,
        totalVat: totals.totalVat,
        totalWithVatCents: totals.totalWithVatCents,
        totalWithVat: totals.totalWithVat,
      },
    });
  } catch (error) {
    if (error.code === 'PERIOD_LOCKED') {
      return res.status(423).json({ error: error.message });
    }
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Chyba při generování faktury' });
  }
});

// PUT aktualizace faktury
router.put('/:id', authMiddleware, authorize('invoices:generate'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, totalAmount, totalAmountCents, totalVat, totalVatCents, roundingMode } =
      req.body;

    const existing = await prisma.invoice.findUnique({
      where: { id: parseInt(id, 10) },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Faktura nenalezena' });
    }

    const updateData = {};
    if (status && InvoiceStatus[status]) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (roundingMode && RoundingMode[roundingMode]) {
      updateData.roundingMode = roundingMode;
    }

    if (totalAmountCents !== undefined) {
      updateData.totalAmountCents = parseInt(totalAmountCents, 10);
    } else if (totalAmount !== undefined) {
      updateData.totalAmountCents = Math.round(Number(totalAmount) * 100);
    }

    if (totalVatCents !== undefined) {
      updateData.totalVatCents = parseInt(totalVatCents, 10);
    } else if (totalVat !== undefined) {
      updateData.totalVatCents = Math.round(Number(totalVat) * 100);
    }

    const invoice = await prisma.invoice.update({
      where: { id: parseInt(id, 10) },
      data: updateData,
      include: {
        organization: true,
      },
    });

    res.json(mapInvoice(invoice));
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ error: 'Chyba při aktualizaci faktury' });
  }
});

// DELETE smazání faktury
router.delete('/:id', authMiddleware, authorize('invoices:delete'), async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.invoice.findUnique({
      where: { id: parseInt(id, 10) },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Faktura nenalezena' });
    }

    if (existing.status === InvoiceStatus.SENT || existing.status === InvoiceStatus.PAID) {
      return res.status(400).json({
        error: 'Nelze smazat odeslanou nebo zaplacenou fakturu',
      });
    }

    await prisma.invoice.delete({
      where: { id: parseInt(id, 10) },
    });

    res.json({ message: 'Faktura smazána' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'Chyba při mazání faktury' });
  }
});

// POST hromadné generování faktur
router.post('/generate-batch', authMiddleware, authorize('invoices:generate'), async (req, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: 'Měsíc a rok jsou povinné' });
    }

    const resolvedMonth = parseInt(month, 10);
    const resolvedYear = parseInt(year, 10);

    await assertPeriodUnlocked(prisma, { month: resolvedMonth, year: resolvedYear });

    const organizationsWithRecords = await prisma.workRecord.groupBy({
      by: ['billingOrgId'],
      where: {
        month: resolvedMonth,
        year: resolvedYear,
        billingOrgId: {
          not: null,
        },
      },
      _count: {
        id: true,
      },
    });

    const results = {
      generated: [],
      skipped: [],
      errors: [],
    };

    for (const entry of organizationsWithRecords) {
      const orgId = entry.billingOrgId;

      try {
        const existing = await prisma.invoice.findFirst({
          where: {
            organizationId: orgId,
            month: resolvedMonth,
            year: resolvedYear,
          },
        });

        if (existing) {
          results.skipped.push({
            organizationId: orgId,
            reason: 'Faktura již existuje',
          });
          continue;
        }

        const payload = await collectInvoiceData(orgId, resolvedMonth, resolvedYear);

        if (!payload) {
          results.errors.push({
            organizationId: orgId,
            error: 'Organizace nenalezena',
          });
          continue;
        }

        const invoiceNumber = await generateInvoiceNumber(resolvedYear, resolvedMonth);
        const invoice = await prisma.invoice.create({
          data: {
            organizationId: orgId,
            invoiceNumber,
            month: resolvedMonth,
            year: resolvedYear,
            totalAmountCents: payload.totals.totalAmountCents,
            totalVatCents: payload.totals.totalVatCents,
            status: InvoiceStatus.DRAFT,
            generatedAt: new Date(),
          },
        });

        results.generated.push(mapInvoice(invoice));
      } catch (error) {
        results.errors.push({
          organizationId: orgId,
          error: error.message,
        });
      }
    }

    res.json({
      summary: {
        total: organizationsWithRecords.length,
        generated: results.generated.length,
        skipped: results.skipped.length,
        errors: results.errors.length,
      },
      results,
    });
  } catch (error) {
    if (error.code === 'PERIOD_LOCKED') {
      return res.status(423).json({ error: error.message });
    }
    console.error('Error batch generating invoices:', error);
    res.status(500).json({ error: 'Chyba při hromadném generování faktur' });
  }
});

// GET PDF faktury
router.get('/:id/pdf', authMiddleware, authorize('invoices:export'), async (req, res) => {
  try {
    const payload = await getInvoiceWithData(parseInt(req.params.id, 10));

    if (!payload) {
      return res.status(404).json({ error: 'Faktura nenalezena' });
    }

    const { invoice, organization, workRecords, services, hardware } = payload;

    let pdfLocation = invoice.pdfUrl || null;
    let buffer = null;

    if (pdfLocation) {
      buffer = await storageService.getFileBuffer(pdfLocation).catch(() => null);
    }

    if (!buffer) {
      pdfLocation = await generateInvoicePdf({
        invoice,
        organization,
        workRecords,
        services,
        hardware,
      });
      buffer = await storageService.getFileBuffer(pdfLocation);

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { pdfUrl: pdfLocation },
      });
    }

    const filename = `${invoice.invoiceNumber}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Chyba při generování PDF' });
  }
});

// GET Pohoda XML
router.get('/:id/pohoda-xml', authMiddleware, authorize('invoices:export'), async (req, res) => {
  try {
    const payload = await getInvoiceWithData(parseInt(req.params.id, 10));

    if (!payload) {
      return res.status(404).json({ error: 'Faktura nenalezena' });
    }

    const { invoice, organization, workRecords, services, hardware } = payload;

    let xmlLocation = invoice.pohodaXml || null;
    let buffer = null;

    if (xmlLocation) {
      buffer = await storageService.getFileBuffer(xmlLocation).catch(() => null);
    }

    if (!buffer) {
      xmlLocation = await generatePohodaXml({
        invoice,
        organization,
        workRecords,
        services,
        hardware,
      });
      buffer = await storageService.getFileBuffer(xmlLocation);

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { pohodaXml: xmlLocation },
      });
    }

    const filename = `${invoice.invoiceNumber}.xml`;
    res.setHeader('Content-Type', 'application/xml; charset=windows-1250');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error generating Pohoda XML:', error);
    res.status(500).json({ error: 'Chyba při generování Pohoda XML' });
  }
});

// GET ISDOC
router.get('/:id/isdoc', authMiddleware, authorize('invoices:export'), async (req, res) => {
  try {
    const payload = await getInvoiceWithData(parseInt(req.params.id, 10));

    if (!payload) {
      return res.status(404).json({ error: 'Faktura nenalezena' });
    }

    const { invoice, organization, workRecords, services, hardware, totals } = payload;

    let isdocLocation = invoice.isdocUrl || null;
    let buffer = null;

    if (isdocLocation) {
      buffer = await storageService.getFileBuffer(isdocLocation).catch(() => null);
    }

    if (!buffer) {
      isdocLocation = await generateIsdoc({
        invoice,
        organization,
        workRecords,
        services,
        hardware,
        totals,
      });
      buffer = await storageService.getFileBuffer(isdocLocation);

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { isdocUrl: isdocLocation },
      });
    }

    const filename = `${invoice.invoiceNumber}.isdoc`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error generating ISDOC:', error);
    res.status(500).json({ error: 'Chyba při generování ISDOC' });
  }
});

router.get('/:id/export', authMiddleware, authorize('invoices:export'), async (req, res) => {
  try {
    const payload = await getInvoiceWithData(parseInt(req.params.id, 10));

    if (!payload) {
      return res.status(404).json({ error: 'Faktura nenalezena' });
    }

    const { invoice, organization, workRecords, services, hardware } = payload;
    let xmlLocation = invoice.pohodaXml || null;
    let buffer = null;

    if (xmlLocation) {
      buffer = await storageService.getFileBuffer(xmlLocation).catch(() => null);
    }

    if (!buffer) {
      const stored = await pohodaExport.savePohodaXML(
        invoice,
        workRecords,
        services,
        hardware,
        organization,
      );
      xmlLocation = stored.location;
      buffer = await storageService.getFileBuffer(xmlLocation);

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { pohodaXml: xmlLocation },
      });
    }

    const filename = `${invoice.invoiceNumber}.xml`;
    res.setHeader('Content-Type', 'application/xml; charset=windows-1250');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting invoice XML:', error);
    res.status(500).json({ error: 'Chyba při exportu faktury' });
  }
});

router.post('/export-batch', authMiddleware, authorize('invoices:export'), async (req, res) => {
  try {
    const { invoiceIds } = req.body;

    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({ error: 'Seznam faktur je povinný' });
    }

    const missing = [];
    const payloads = [];

    for (const rawId of invoiceIds) {
      const invoiceId = parseInt(rawId, 10);

      if (Number.isNaN(invoiceId)) {
        return res.status(400).json({ error: 'Neplatné ID faktury', invalidId: rawId });
      }

      const payload = await getInvoiceWithData(invoiceId);

      if (!payload) {
        missing.push(invoiceId);
      } else {
        payloads.push(payload);
      }
    }

    if (missing.length > 0) {
      return res.status(404).json({ error: 'Některé faktury nebyly nalezeny', missing });
    }

    if (payloads.length === 0) {
      return res.status(404).json({ error: 'Žádné faktury k exportu' });
    }

    const xmlData = pohodaExport.generateBatchXML(payloads);
    const now = new Date();
    const filename = `pohoda-export-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.xml`;

    res.setHeader('Content-Type', 'application/xml; charset=windows-1250');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xmlData);
  } catch (error) {
    console.error('Error exporting invoices batch:', error);
    res.status(500).json({ error: 'Chyba při exportu faktur' });
  }
});

// GET statistiky faktur
router.get('/stats/:year', authMiddleware, async (req, res) => {
  try {
    const { year } = req.params;

    const stats = await prisma.invoice.groupBy({
      by: ['month', 'status'],
      where: {
        year: parseInt(year, 10),
      },
      _sum: {
        totalAmountCents: true,
        totalVatCents: true,
      },
      _count: {
        id: true,
      },
    });

    const monthlyStats = {};

    for (let monthIdx = 1; monthIdx <= 12; monthIdx += 1) {
      monthlyStats[monthIdx] = {
        totalCents: 0,
        total: 0,
        byStatus: {
          DRAFT: { count: 0, amountCents: 0, amount: 0 },
          SENT: { count: 0, amountCents: 0, amount: 0 },
          PAID: { count: 0, amountCents: 0, amount: 0 },
          CANCELLED: { count: 0, amountCents: 0, amount: 0 },
        },
      };
    }

    stats.forEach((stat) => {
      const amountCents = stat._sum.totalAmountCents || 0;
      const entry = monthlyStats[stat.month];
      entry.totalCents += amountCents;
      entry.total += stat._count.id;
      entry.byStatus[stat.status] = {
        count: stat._count.id,
        amountCents,
        amount: fromCents(amountCents),
      };
    });

    const yearTotalCents = Object.values(monthlyStats).reduce(
      (sum, monthStat) => sum + monthStat.totalCents,
      0,
    );
    const yearCount = Object.values(monthlyStats).reduce(
      (sum, monthStat) => sum + monthStat.total,
      0,
    );

    res.json({
      year: parseInt(year, 10),
      monthlyStats: Object.entries(monthlyStats).reduce((acc, [key, value]) => {
        acc[key] = {
          totalCents: value.totalCents,
          total: value.total,
          totalAmount: fromCents(value.totalCents),
          byStatus: value.byStatus,
        };
        return acc;
      }, {}),
      yearTotalCents,
      yearTotal: fromCents(yearTotalCents),
      yearCount,
    });
  } catch (error) {
    console.error('Error fetching invoice stats:', error);
    res.status(500).json({ error: 'Chyba při načítání statistik' });
  }
});

module.exports = router;
