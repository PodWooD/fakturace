const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const PDFGenerator = require('../services/pdfGenerator');
const PohodaExport = require('../services/pohodaExport');

const prisma = new PrismaClient();
const pdfGenerator = new PDFGenerator();
const pohodaExport = new PohodaExport();

const VAT_RATE = 0.21;

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const buildWorkRecordWhere = (organizationId, month, year) => ({
  OR: [
    {
      billingOrgId: organizationId,
      month,
      year
    },
    {
      billingOrgId: null,
      organizationId,
      month,
      year
    }
  ]
});

const collectInvoiceData = async (organizationId, month, year, { includeWorkplace = false } = {}) => {
  const resolvedOrgId = parseInt(organizationId, 10);
  const resolvedMonth = parseInt(month, 10);
  const resolvedYear = parseInt(year, 10);

  const organization = await prisma.organization.findUnique({
    where: { id: resolvedOrgId }
  });

  if (!organization) {
    return null;
  }

  const [workRecords, services, hardware] = await Promise.all([
    prisma.workRecord.findMany({
      where: buildWorkRecordWhere(resolvedOrgId, resolvedMonth, resolvedYear),
      include: includeWorkplace ? { organization: true, billingOrg: true } : undefined,
      orderBy: { date: 'asc' }
    }),
    prisma.service.findMany({
      where: {
        organizationId: resolvedOrgId,
        isActive: true
      }
    }),
    prisma.hardware.findMany({
      where: {
        organizationId: resolvedOrgId,
        month: resolvedMonth,
        year: resolvedYear
      }
    })
  ]);

  const hourlyRate = Number(organization.hourlyRate || 0);
  const kmRate = Number(organization.kmRate || 0);

  let workAmount = 0;
  let kmAmount = 0;

  workRecords.forEach((record) => {
    const hours = record.minutes / 60;
    workAmount += hours * hourlyRate;
    kmAmount += record.kilometers * kmRate;
  });

  const servicesAmount = services.reduce((sum, service) => sum + Number(service.monthlyPrice || 0), 0);
  const hardwareAmount = hardware.reduce((sum, item) => sum + Number(item.totalPrice || item.unitPrice * item.quantity || 0), 0);

  const totalAmount = roundCurrency(workAmount + kmAmount + servicesAmount + hardwareAmount);
  const totalVat = roundCurrency(totalAmount * VAT_RATE);

  return {
    organization,
    workRecords,
    services,
    hardware,
    totals: {
      workAmount: roundCurrency(workAmount),
      kmAmount: roundCurrency(kmAmount),
      servicesAmount: roundCurrency(servicesAmount),
      hardwareAmount: roundCurrency(hardwareAmount),
      totalAmount,
      totalVat,
      totalWithVat: roundCurrency(totalAmount + totalVat)
    }
  };
};

const generateInvoiceNumber = async (year, month) => {
  const lastInvoice = await prisma.invoice.findFirst({
    where: { year },
    orderBy: { invoiceNumber: 'desc' }
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
      organization: true
    }
  });

  if (!invoice) {
    return null;
  }

  const { organization } = invoice;
  const month = invoice.month;
  const year = invoice.year;

  const [workRecords, services, hardware] = await Promise.all([
    prisma.workRecord.findMany({
      where: buildWorkRecordWhere(invoice.organizationId, month, year),
      orderBy: { date: 'asc' }
    }),
    prisma.service.findMany({
      where: {
        organizationId: invoice.organizationId,
        isActive: true
      }
    }),
    prisma.hardware.findMany({
      where: {
        organizationId: invoice.organizationId,
        month,
        year
      }
    })
  ]);

  return { invoice, organization, workRecords, services, hardware };
};

// GET faktury s filtrováním
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { month, year, organizationId, status, page = 1, limit = 20 } = req.query;

    const where = {};
    if (month) where.month = parseInt(month);
    if (year) where.year = parseInt(year);
    if (organizationId) where.organizationId = parseInt(organizationId);
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
            dic: true
          }
        }
      },
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
        { invoiceNumber: 'desc' }
      ],
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit)
    });

    res.json({
      data: invoices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Chyba při načítání faktur' });
  }
});

// GET detail faktury
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const payload = await getInvoiceWithData(invoiceId);

    if (!payload) {
      return res.status(404).json({ error: 'Faktura nenalezena' });
    }

    const { invoice, workRecords, services, hardware } = payload;

    res.json({
      ...invoice,
      workRecords,
      services,
      hardware
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Chyba při načítání faktury' });
  }
});

// POST preview faktury (bez vytvoření)
router.post('/preview', authMiddleware, async (req, res) => {
  try {
    const { organizationId, month, year } = req.body;

    if (!organizationId || !month || !year) {
      return res.status(400).json({
        error: 'Organizace, měsíc a rok jsou povinné'
      });
    }

    const payload = await collectInvoiceData(organizationId, month, year, { includeWorkplace: true });

    if (!payload) {
      return res.status(404).json({ error: 'Organizace nenalezena' });
    }

    const { organization, workRecords, services, hardware, totals } = payload;

    res.json({
      organization,
      month: parseInt(month, 10),
      year: parseInt(year, 10),
      workRecords,
      services,
      hardware,
      summary: {
        workAmount: totals.workAmount.toFixed(2),
        kmAmount: totals.kmAmount.toFixed(2),
        servicesAmount: totals.servicesAmount.toFixed(2),
        hardwareAmount: totals.hardwareAmount.toFixed(2),
        totalAmount: totals.totalAmount.toFixed(2),
        totalVat: totals.totalVat.toFixed(2),
        totalWithVat: totals.totalWithVat.toFixed(2)
      }
    });
  } catch (error) {
    console.error('Error creating invoice preview:', error);
    res.status(500).json({ error: 'Chyba při vytváření náhledu faktury' });
  }
});

// POST generování faktury
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { organizationId, month, year } = req.body;

    if (!organizationId || !month || !year) {
      return res.status(400).json({
        error: 'Organizace, měsíc a rok jsou povinné'
      });
    }

    const resolvedOrgId = parseInt(organizationId, 10);
    const resolvedMonth = parseInt(month, 10);
    const resolvedYear = parseInt(year, 10);

    const existing = await prisma.invoice.findFirst({
      where: {
        organizationId: resolvedOrgId,
        month: resolvedMonth,
        year: resolvedYear
      }
    });

    if (existing) {
      return res.status(400).json({
        error: 'Faktura pro tuto organizaci a období již existuje'
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
        totalAmount: totals.totalAmount,
        totalVat: totals.totalVat,
        status: 'DRAFT'
      },
      include: {
        organization: true
      }
    });

    res.status(201).json({
      ...invoice,
      breakdown: {
        workAmount: totals.workAmount.toFixed(2),
        kmAmount: totals.kmAmount.toFixed(2),
        servicesAmount: totals.servicesAmount.toFixed(2),
        hardwareAmount: totals.hardwareAmount.toFixed(2),
        workRecordsCount: workRecords.length,
        servicesCount: services.length,
        hardwareCount: hardware.length
      },
      totals: {
        totalAmount: totals.totalAmount.toFixed(2),
        totalVat: totals.totalVat.toFixed(2)
      }
    });
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Chyba při generování faktury' });
  }
});

// PUT aktualizace faktury
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, totalAmount, totalVat } = req.body;

    const existing = await prisma.invoice.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Faktura nenalezena' });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (totalAmount !== undefined) updateData.totalAmount = totalAmount;
    if (totalVat !== undefined) updateData.totalVat = totalVat;

    const invoice = await prisma.invoice.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        organization: true
      }
    });

    res.json(invoice);
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ error: 'Chyba při aktualizaci faktury' });
  }
});

// DELETE smazání faktury
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.invoice.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Faktura nenalezena' });
    }

    // Kontrola, zda není faktura již odeslána nebo zaplacená
    if (existing.status === 'SENT' || existing.status === 'PAID') {
      return res.status(400).json({ 
        error: 'Nelze smazat odeslanou nebo zaplacenou fakturu' 
      });
    }

    await prisma.invoice.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Faktura smazána' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'Chyba při mazání faktury' });
  }
});

// POST hromadné generování faktur
router.post('/generate-batch', authMiddleware, async (req, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: 'Měsíc a rok jsou povinné' });
    }

    const resolvedMonth = parseInt(month, 10);
    const resolvedYear = parseInt(year, 10);

    const organizationsWithRecords = await prisma.workRecord.groupBy({
      by: ['billingOrgId'],
      where: {
        month: resolvedMonth,
        year: resolvedYear,
        billingOrgId: {
          not: null
        }
      },
      _count: {
        id: true
      }
    });

    const results = {
      generated: [],
      skipped: [],
      errors: []
    };

    for (const entry of organizationsWithRecords) {
      const orgId = entry.billingOrgId;

      try {
        const existing = await prisma.invoice.findFirst({
          where: {
            organizationId: orgId,
            month: resolvedMonth,
            year: resolvedYear
          }
        });

        if (existing) {
          results.skipped.push({
            organizationId: orgId,
            reason: 'Faktura již existuje'
          });
          continue;
        }

        const payload = await collectInvoiceData(orgId, resolvedMonth, resolvedYear);

        if (!payload) {
          results.errors.push({
            organizationId: orgId,
            error: 'Organizace nenalezena'
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
            totalAmount: payload.totals.totalAmount,
            totalVat: payload.totals.totalVat,
            status: 'DRAFT'
          }
        });

        results.generated.push(invoice);
      } catch (error) {
        results.errors.push({
          organizationId: orgId,
          error: error.message
        });
      }
    }

    res.json({
      summary: {
        total: organizationsWithRecords.length,
        generated: results.generated.length,
        skipped: results.skipped.length,
        errors: results.errors.length
      },
      results
    });
  } catch (error) {
    console.error('Error batch generating invoices:', error);
    res.status(500).json({ error: 'Chyba při hromadném generování faktur' });
  }
});

// GET PDF faktury
router.get('/:id/pdf', authMiddleware, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const payload = await getInvoiceWithData(invoiceId);

    if (!payload) {
      return res.status(404).json({ error: 'Faktura nenalezena' });
    }

    const { invoice, organization, workRecords, services, hardware } = payload;

    const pdfData = await pdfGenerator.generateInvoice(
      invoice,
      workRecords,
      services,
      hardware,
      organization
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    res.send(pdfData);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Chyba při generování PDF' });
  }
});

// GET Pohoda XML
router.get('/:id/pohoda-xml', authMiddleware, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const payload = await getInvoiceWithData(invoiceId);

    if (!payload) {
      return res.status(404).json({ error: 'Faktura nenalezena' });
    }

    const { invoice, organization, workRecords, services, hardware } = payload;
    const xmlData = pohodaExport.generateInvoiceXML(
      invoice,
      workRecords,
      services,
      hardware,
      organization
    );

    res.setHeader('Content-Type', 'application/xml; charset=windows-1250');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.xml"`);
    res.send(xmlData);
  } catch (error) {
    console.error('Error generating Pohoda XML:', error);
    res.status(500).json({ error: 'Chyba při generování Pohoda XML' });
  }
});

router.get('/:id/export', authMiddleware, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const payload = await getInvoiceWithData(invoiceId);

    if (!payload) {
      return res.status(404).json({ error: 'Faktura nenalezena' });
    }

    const { invoice, organization, workRecords, services, hardware } = payload;
    const xmlData = pohodaExport.generateInvoiceXML(
      invoice,
      workRecords,
      services,
      hardware,
      organization
    );

    res.setHeader('Content-Type', 'application/xml; charset=windows-1250');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.xml"`);
    res.send(xmlData);
  } catch (error) {
    console.error('Error exporting invoice XML:', error);
    res.status(500).json({ error: 'Chyba při exportu faktury' });
  }
});

router.post('/export-batch', authMiddleware, async (req, res) => {
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
        year: parseInt(year)
      },
      _sum: {
        totalAmount: true,
        totalVat: true
      },
      _count: {
        id: true
      }
    });

    // Transformace dat pro lepší použití
    const monthlyStats = {};
    
    for (let month = 1; month <= 12; month++) {
      monthlyStats[month] = {
        total: 0,
        count: 0,
        byStatus: {
          DRAFT: { count: 0, amount: 0 },
          SENT: { count: 0, amount: 0 },
          PAID: { count: 0, amount: 0 },
          CANCELLED: { count: 0, amount: 0 }
        }
      };
    }

    stats.forEach(stat => {
      const amount = parseFloat(stat._sum.totalAmount || 0);
      monthlyStats[stat.month].total += amount;
      monthlyStats[stat.month].count += stat._count.id;
      monthlyStats[stat.month].byStatus[stat.status] = {
        count: stat._count.id,
        amount
      };
    });

    res.json({
      year: parseInt(year),
      monthlyStats,
      yearTotal: Object.values(monthlyStats).reduce((sum, month) => sum + month.total, 0),
      yearCount: Object.values(monthlyStats).reduce((sum, month) => sum + month.count, 0)
    });
  } catch (error) {
    console.error('Error fetching invoice stats:', error);
    res.status(500).json({ error: 'Chyba při načítání statistik' });
  }
});

module.exports = router;
