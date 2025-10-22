const express = require('express');

const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { authorize } = authMiddleware;
const { toCents, fromCents } = require('../utils/money');
const { logAudit } = require('../services/auditLogger');

const prisma = new PrismaClient();

const mapService = (service) => ({
  ...service,
  monthlyPriceCents: service.monthlyPriceCents,
  monthlyPrice: fromCents(service.monthlyPriceCents),
});

const mapOrganization = (organization) => ({
  ...organization,
  hourlyRateCents: organization.hourlyRateCents,
  kilometerRateCents: organization.kilometerRateCents,
  outsourcingFeeCents: organization.outsourcingFeeCents,
  hardwareMarginPct: organization.hardwareMarginPct,
  softwareMarginPct: organization.softwareMarginPct,
  hourlyRate: fromCents(organization.hourlyRateCents),
  kilometerRate: fromCents(organization.kilometerRateCents),
  outsourcingFee: fromCents(organization.outsourcingFeeCents),
  services: organization.services ? organization.services.map(mapService) : [],
});

const resolveCentsValue = ({ value, cents }) => {
  if (value !== undefined && value !== null && value !== '') {
    const resolved = toCents(value);
    if (resolved === null) {
      return null;
    }
    return resolved;
  }

  if (cents !== undefined && cents !== null) {
    const numeric = Number(cents);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    return Math.round(numeric);
  }

  return null;
};

const parseOrganizationPayload = (payload) => {
  const hourlyRateCents = resolveCentsValue({
    value: payload.hourlyRate,
    cents: payload.hourlyRateCents,
  });
  const kilometerRateCents = resolveCentsValue({
    value: payload.kilometerRate,
    cents: payload.kilometerRateCents ?? payload.kmRate,
  });
  const outsourcingFeeCents = resolveCentsValue({
    value: payload.outsourcingFee,
    cents: payload.outsourcingFeeCents,
  });

  if (hourlyRateCents === null || kilometerRateCents === null) {
    throw new Error('INVALID_RATES');
  }

  return {
    name: payload.name,
    code: payload.code || null,
    contactPerson: payload.contactPerson || null,
    address: payload.address || null,
    ico: payload.ico || null,
    dic: payload.dic || null,
    email: payload.email || null,
    phone: payload.phone || null,
    hourlyRateCents,
    kilometerRateCents,
    outsourcingFeeCents: outsourcingFeeCents ?? 0,
    hardwareMarginPct: Number.isFinite(Number(payload.hardwareMarginPct))
      ? Number(payload.hardwareMarginPct)
      : 0,
    softwareMarginPct: Number.isFinite(Number(payload.softwareMarginPct))
      ? Number(payload.softwareMarginPct)
      : 0,
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
  };
};

// GET všechny organizace
router.get('/', authMiddleware, async (req, res) => {
  try {
    const organizations = await prisma.organization.findMany({
      include: {
        services: {
          where: { isActive: true },
        },
        _count: {
          select: {
            workRecords: true,
            invoices: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    res.json({
      data: organizations.map(mapOrganization),
      total: organizations.length,
    });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ error: 'Chyba při načítání organizací' });
  }
});

// GET detail organizace
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: parseInt(req.params.id, 10) },
      include: {
        services: true,
        workRecords: {
          orderBy: { date: 'desc' },
          take: 10,
        },
        invoices: {
          orderBy: { generatedAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organizace nenalezena' });
    }

    res.json(mapOrganization(organization));
  } catch (error) {
    console.error('Error fetching organization:', error);
    res.status(500).json({ error: 'Chyba při načítání organizace' });
  }
});

// POST vytvoření organizace
router.post('/', authMiddleware, authorize('organizations:write'), async (req, res) => {
  try {
    if (!req.body?.name) {
      return res.status(400).json({ error: 'Název organizace je povinný' });
    }

    // Kontrola unikátního kódu
    if (req.body.code) {
      const existing = await prisma.organization.findUnique({
        where: { code: req.body.code },
      });
      if (existing) {
        return res.status(400).json({ error: 'Kód organizace již existuje' });
      }
    }

    const organizationPayload = parseOrganizationPayload(req.body);

    const organization = await prisma.organization.create({
      data: {
        ...organizationPayload,
        createdBy: req.user.id,
      },
      include: {
        services: true,
      },
    });

    await logAudit(prisma, {
      actorId: req.user?.id,
      entity: 'Organization',
      entityId: organization.id,
      action: 'CREATE',
      diff: organizationPayload,
    });

    res.status(201).json(mapOrganization(organization));
  } catch (error) {
    if (error.message === 'INVALID_RATES') {
      return res.status(400).json({ error: 'Neplatné sazby. Hodnoty musí být čísla.' });
    }
    console.error('Error creating organization:', error);
    res.status(500).json({ error: 'Chyba při vytváření organizace' });
  }
});

// PUT aktualizace organizace
router.put('/:id', authMiddleware, authorize('organizations:write'), async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.organization.findUnique({
      where: { id: parseInt(id, 10) },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Organizace nenalezena' });
    }

    if (req.body.code && req.body.code !== existing.code) {
      const codeExists = await prisma.organization.findUnique({
        where: { code: req.body.code },
      });
      if (codeExists) {
        return res.status(400).json({ error: 'Kód organizace již existuje' });
      }
    }

    const organizationPayload = parseOrganizationPayload({
      ...existing,
      ...req.body,
    });

    const organization = await prisma.organization.update({
      where: { id: parseInt(id, 10) },
      data: organizationPayload,
      include: { services: true },
    });

    await logAudit(prisma, {
      actorId: req.user?.id,
      entity: 'Organization',
      entityId: organization.id,
      action: 'UPDATE',
      diff: organizationPayload,
    });

    res.json(mapOrganization(organization));
  } catch (error) {
    if (error.message === 'INVALID_RATES') {
      return res.status(400).json({ error: 'Neplatné sazby. Hodnoty musí být čísla.' });
    }
    console.error('Error updating organization:', error);
    res.status(500).json({ error: 'Chyba při aktualizaci organizace' });
  }
});

// DELETE smazání organizace
router.delete('/:id', authMiddleware, authorize('organizations:write'), async (req, res) => {
  try {
    const { id } = req.params;

    const org = await prisma.organization.findUnique({
      where: { id: parseInt(id, 10) },
      include: {
        _count: {
          select: {
            workRecords: true,
            invoices: true,
            services: true,
            hardware: true,
          },
        },
      },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organizace nenalezena' });
    }

    const hasRecords = Object.values(org._count).some((count) => count > 0);
    if (hasRecords) {
      return res.status(400).json({
        error: 'Organizaci nelze smazat, obsahuje záznamy',
      });
    }

    await prisma.organization.delete({
      where: { id: parseInt(id, 10) },
    });

    await logAudit(prisma, {
      actorId: req.user?.id,
      entity: 'Organization',
      entityId: parseInt(id, 10),
      action: 'DELETE',
      diff: {},
    });

    res.json({ message: 'Organizace smazána' });
  } catch (error) {
    console.error('Error deleting organization:', error);
    res.status(500).json({ error: 'Chyba při mazání organizace' });
  }
});

// GET statistiky organizací
router.get('/:id/stats', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { month, year } = req.query;

    const where = {
      organizationId: parseInt(id, 10),
    };

    if (month && year) {
      where.month = parseInt(month, 10);
      where.year = parseInt(year, 10);
    }

    const [workRecords, services, hardware, invoices, organization] = await Promise.all([
      prisma.workRecord.aggregate({
        where,
        _sum: {
          minutes: true,
          kilometers: true,
        },
        _count: {
          id: true,
        },
      }),
      prisma.service.findMany({
        where: {
          organizationId: parseInt(id, 10),
          isActive: true,
        },
      }),
      prisma.hardware.aggregate({
        where: {
          organizationId: parseInt(id, 10),
          ...(month &&
            year && {
              month: parseInt(month, 10),
              year: parseInt(year, 10),
            }),
        },
        _sum: {
          totalPriceCents: true,
        },
      }),
      prisma.invoice.findMany({
        where: {
          organizationId: parseInt(id, 10),
          ...(month &&
            year && {
              month: parseInt(month, 10),
              year: parseInt(year, 10),
            }),
        },
        select: {
          status: true,
          totalAmountCents: true,
          totalVatCents: true,
          currency: true,
        },
      }),
      prisma.organization.findUnique({
        where: { id: parseInt(id, 10) },
        select: {
          hourlyRateCents: true,
          kilometerRateCents: true,
        },
      }),
    ]);

    if (!organization) {
      return res.status(404).json({ error: 'Organizace nenalezena' });
    }

    const totalMinutes = workRecords._sum.minutes || 0;
    const totalKm = workRecords._sum.kilometers || 0;
    const servicesAmountCents = services.reduce(
      (sum, service) => sum + (service.monthlyPriceCents || 0),
      0,
    );
    const hardwareAmountCents = hardware._sum.totalPriceCents || 0;

    const workAmountCents = Math.round((totalMinutes / 60) * organization.hourlyRateCents);
    const kmAmountCents = totalKm * organization.kilometerRateCents;

    res.json({
      workRecords: {
        count: workRecords._count.id,
        totalHours: Number((totalMinutes / 60).toFixed(2)),
        totalKm,
        amountCents: workAmountCents,
        amount: fromCents(workAmountCents),
      },
      services: {
        count: services.length,
        amountCents: servicesAmountCents,
        amount: fromCents(servicesAmountCents),
      },
      hardware: {
        amountCents: hardwareAmountCents,
        amount: fromCents(hardwareAmountCents),
      },
      kmAmountCents,
      kmAmount: fromCents(kmAmountCents),
      totalAmountCents:
        workAmountCents + kmAmountCents + servicesAmountCents + hardwareAmountCents,
      totalAmount: fromCents(
        workAmountCents + kmAmountCents + servicesAmountCents + hardwareAmountCents,
      ),
      invoices: invoices.map((invoice) => ({
        ...invoice,
        totalAmount: fromCents(invoice.totalAmountCents),
        totalVat: fromCents(invoice.totalVatCents),
      })),
    });
  } catch (error) {
    console.error('Error fetching organization stats:', error);
    res.status(500).json({ error: 'Chyba při načítání statistik' });
  }
});

module.exports = router;
