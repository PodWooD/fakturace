const express = require('express');

const router = express.Router();
const { PrismaClient, WorkRecordStatus } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { authorize } = authMiddleware;
const { fromCents, normalizeNumber } = require('../utils/money');
const { assertPeriodUnlocked } = require('../utils/accounting');
const { logAudit } = require('../services/auditLogger');

const prisma = new PrismaClient();

const isTechnician = (user) => user?.role === 'TECHNICIAN';

const resolveTechnicianName = (user) => {
  if (!user) {
    return 'Technik';
  }
  if (user.name && typeof user.name === 'string' && user.name.trim()) {
    return user.name.trim();
  }
  if (user.email && typeof user.email === 'string') {
    return user.email.trim();
  }
  return 'Technik';
};

const ensureTechnicianOwnership = (user, record) => {
  if (!isTechnician(user)) {
    return;
  }

  const technicianName = resolveTechnicianName(user);
  const ownsByUserId = Boolean(record.userId && user?.id && record.userId === user.id);
  const ownsByName = Boolean(
    technicianName &&
    record.worker &&
    record.worker.toLowerCase() === technicianName.toLowerCase(),
  );

  if (!ownsByUserId && !ownsByName) {
    const error = new Error('Technici mohou pracovat pouze se svými záznamy');
    error.code = 'TECHNICIAN_FORBIDDEN';
    throw error;
  }
};

const mapOrganization = (organization) => {
  if (!organization) {
    return null;
  }

  return {
    ...organization,
    hourlyRate: fromCents(organization.hourlyRateCents),
    kilometerRate: fromCents(organization.kilometerRateCents),
  };
};

const enrichRecord = (record) => {
  const organization = mapOrganization(record.organization);
  const billingOrg = mapOrganization(record.billingOrg);
  const minutes = record.minutes || 0;
  const kilometers = record.kilometers || 0;
  const hourlyRateCents = organization?.hourlyRateCents || 0;
  const kilometerRateCents = organization?.kilometerRateCents || 0;
  const hours = minutes / 60;
  const hourlyAmountCents = Math.round(hours * hourlyRateCents);
  const kmAmountCents = kilometers * kilometerRateCents;
  const totalAmountCents = hourlyAmountCents + kmAmountCents;

  return {
    ...record,
    organization,
    billingOrg,
    hours: Number(hours.toFixed(2)),
    hourlyAmountCents,
    hourlyAmount: fromCents(hourlyAmountCents),
    kmAmountCents,
    kmAmount: fromCents(kmAmountCents),
    totalAmountCents,
    totalAmount: fromCents(totalAmountCents),
  };
};

const toInt = (value) => {
  const numeric = normalizeNumber(value);
  return numeric === null ? 0 : Math.round(numeric);
};

const parseMinutes = ({ minutes, hours, timeFrom, timeTo }) => {
  if (minutes !== undefined && minutes !== null && minutes !== '') {
    return toInt(minutes);
  }

  if (hours !== undefined && hours !== null && hours !== '') {
    if (typeof hours === 'string' && hours.includes(':')) {
      const [h, m] = hours.split(':').map((piece) => parseInt(piece, 10));
      if (Number.isFinite(h) && Number.isFinite(m)) {
        return h * 60 + m;
      }
    }
    const numeric = normalizeNumber(hours);
    if (numeric !== null) {
      return Math.round(numeric * 60);
    }
  }

  if (timeFrom && timeTo) {
    const [fromHours, fromMinutes] = timeFrom.split(':').map((n) => parseInt(n, 10));
    const [toHours, toMinutes] = timeTo.split(':').map((n) => parseInt(n, 10));
    if (
      Number.isFinite(fromHours) &&
      Number.isFinite(fromMinutes) &&
      Number.isFinite(toHours) &&
      Number.isFinite(toMinutes)
    ) {
      const fromTotal = fromHours * 60 + fromMinutes;
      const toTotal = toHours * 60 + toMinutes;
      let total = toTotal - fromTotal;
      if (total < 0) {
        total += 24 * 60;
      }
      return total;
    }
  }

  return 0;
};

const resolveDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error('Neplatné datum');
    error.code = 'INVALID_DATE';
    throw error;
  }
  return date;
};

const ensureOrganizationExists = async (organizationId) => {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, isActive: true },
  });

  if (!organization) {
    const error = new Error('Organizace nenalezena');
    error.code = 'ORGANIZATION_NOT_FOUND';
    throw error;
  }

  if (!organization.isActive) {
    const error = new Error('Organizace je deaktivována');
    error.code = 'ORGANIZATION_INACTIVE';
    throw error;
  }

  return organization;
};

const fetchRecordWithRelations = async (id) =>
  prisma.workRecord.findUnique({
    where: { id },
    include: {
      organization: true,
      billingOrg: true,
      user: {
        select: { id: true, email: true, name: true },
      },
    },
  });

// GET pracovní záznamy s filtrováním
router.get('/', authMiddleware, async (req, res) => {
  try {
    const {
      month,
      year,
      organizationId,
      worker,
      status,
      page = 1,
      limit = 50,
    } = req.query;

    const where = {};
    const andConditions = [];

    const monthNumber = parseInt(month, 10);
    if (!Number.isNaN(monthNumber)) {
      where.month = monthNumber;
    }

    const yearNumber = parseInt(year, 10);
    if (!Number.isNaN(yearNumber)) {
      where.year = yearNumber;
    }

    const organizationNumber = parseInt(organizationId, 10);
    if (!Number.isNaN(organizationNumber)) {
      where.organizationId = organizationNumber;
    }

    if (status) {
      where.status = status;
    }

    if (worker) {
      andConditions.push({ worker: { contains: worker, mode: 'insensitive' } });
    }

    if (isTechnician(req.user)) {
      const technicianName = resolveTechnicianName(req.user);
      const technicianFilters = [];
      if (req.user?.id) {
        technicianFilters.push({ userId: req.user.id });
      }
      if (technicianName) {
        technicianFilters.push({ worker: { equals: technicianName, mode: 'insensitive' } });
      }
      if (technicianFilters.length) {
        andConditions.push({ OR: technicianFilters });
      }
    }

    if (andConditions.length) {
      where.AND = andConditions;
    }

    const total = await prisma.workRecord.count({ where });

    const records = await prisma.workRecord.findMany({
      where,
      include: {
        organization: true,
        billingOrg: true,
        user: {
          select: { id: true, email: true, name: true },
        },
      },
      orderBy: [
        { date: 'desc' },
        { id: 'desc' },
      ],
      skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
      take: parseInt(limit, 10),
    });

    res.json({
      data: records.map(enrichRecord),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    console.error('Error fetching work records:', error);
    res.status(500).json({ error: 'Chyba při načítání pracovních záznamů' });
  }
});

// POST hromadné vytvoření záznamů (musí být před /:id)
router.post('/bulk', authMiddleware, authorize('workRecords:write'), async (req, res) => {
  try {
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Pole záznamů je povinné' });
    }

    const created = [];
    const errors = [];

    for (let index = 0; index < records.length; index += 1) {
      const payload = records[index];
      if (isTechnician(req.user)) {
        payload.worker = resolveTechnicianName(req.user) || payload.worker;
      }
      try {
        const organizationId = parseInt(payload.organizationId, 10);
        if (!organizationId) {
          throw new Error('Chybí organizationId');
        }

        await ensureOrganizationExists(organizationId);

        const recordDate = resolveDate(payload.date);
        await assertPeriodUnlocked(prisma, {
          month: recordDate.getMonth() + 1,
          year: recordDate.getFullYear(),
        });

        const minutes = parseMinutes(payload);

        const workRecord = await prisma.workRecord.create({
          data: {
            organizationId,
            date: recordDate,
            worker: payload.worker || 'Neznámý technik',
            description: payload.description || '',
            minutes,
            kilometers: toInt(payload.kilometers),
            timeFrom: payload.timeFrom || null,
            timeTo: payload.timeTo || null,
            branch: payload.branch || null,
            month: recordDate.getMonth() + 1,
            year: recordDate.getFullYear(),
            projectCode: payload.projectCode || null,
            billingOrgId: payload.billingOrgId
              ? parseInt(payload.billingOrgId, 10)
              : organizationId,
            status: payload.status && WorkRecordStatus[payload.status]
              ? payload.status
              : WorkRecordStatus.DRAFT,
            userId: req.user?.id || null,
            createdBy: req.user?.id || null,
          },
          include: {
            organization: true,
            billingOrg: true,
            user: {
              select: { id: true, email: true, name: true },
            },
          },
        });

        const enriched = enrichRecord(workRecord);
        await logAudit(prisma, {
          actorId: req.user?.id,
          entity: 'WorkRecord',
          entityId: workRecord.id,
          action: 'CREATE',
          diff: {
            minutes: enriched.minutes,
            kilometers: enriched.kilometers,
            organizationId: enriched.organizationId,
            date: enriched.date,
          },
        });
        created.push(enriched);
      } catch (error) {
        errors.push({
          index,
          message: error.message,
        });
      }
    }

    res.json({
      created: created.length,
      total: records.length,
      records: created,
      errors,
    });
  } catch (error) {
    console.error('Error bulk creating work records:', error);
    res.status(500).json({ error: 'Chyba při hromadném vytváření záznamů' });
  }
});

// GET souhrn práce za měsíc (musí být před /:id)
router.get('/summary/:year/:month', authMiddleware, async (req, res) => {
  try {
    if (isTechnician(req.user)) {
      return res.status(403).json({ error: 'Nedostatečná oprávnění' });
    }
    const { year, month } = req.params;
    const { groupBy = 'billing' } = req.query;

    const groupByField = groupBy === 'workplace' ? 'organizationId' : 'billingOrgId';

    const summary = await prisma.workRecord.groupBy({
      by: [groupByField],
      where: {
        month: parseInt(month, 10),
        year: parseInt(year, 10),
      },
      _sum: {
        minutes: true,
        kilometers: true,
      },
      _count: {
        id: true,
      },
    });

    const organizationIds = summary
      .map((item) => item[groupByField])
      .filter((id) => id !== null);

    if (organizationIds.length === 0) {
      return res.json([]);
    }

    const organizations = await prisma.organization.findMany({
      where: {
        id: { in: organizationIds },
      },
    });

    const invoices = await prisma.invoice.findMany({
      where: {
        month: parseInt(month, 10),
        year: parseInt(year, 10),
        organizationId: { in: organizationIds },
      },
      select: {
        organizationId: true,
        status: true,
        invoiceNumber: true,
        totalAmountCents: true,
        totalVatCents: true,
      },
    });

    const invoicesByOrg = invoices.reduce((acc, invoice) => {
      acc[invoice.organizationId] = invoice;
      return acc;
    }, {});

    const result = summary
      .map((item) => {
        const orgId = item[groupByField];
        const organization = organizations.find((org) => org.id === orgId);

        if (!organization) {
          return null;
        }

        const minutes = item._sum.minutes || 0;
        const kilometers = item._sum.kilometers || 0;
        const hours = minutes / 60;
        const hourlyAmountCents = Math.round(hours * (organization.hourlyRateCents || 0));
        const kmAmountCents = kilometers * (organization.kilometerRateCents || 0);
        const totalAmountCents = hourlyAmountCents + kmAmountCents;

        const invoice = invoicesByOrg[orgId];

        return {
          organization: mapOrganization(organization),
          recordsCount: item._count.id,
          totalHours: Number(hours.toFixed(2)),
          totalKm: kilometers,
          hourlyAmountCents,
          hourlyAmount: fromCents(hourlyAmountCents),
          kmAmountCents,
          kmAmount: fromCents(kmAmountCents),
          totalAmountCents,
          totalAmount: fromCents(totalAmountCents),
          invoice: invoice
            ? {
                status: invoice.status,
                invoiceNumber: invoice.invoiceNumber,
                totalAmountCents: invoice.totalAmountCents,
                totalAmount: fromCents(invoice.totalAmountCents),
                totalVatCents: invoice.totalVatCents,
                totalVat: fromCents(invoice.totalVatCents),
              }
            : null,
        };
      })
      .filter((item) => item !== null);

    res.json(result);
  } catch (error) {
    console.error('Error fetching work summary:', error);
    res.status(500).json({ error: 'Chyba při načítání souhrnu' });
  }
});

// GET dostupné měsíce s daty (musí být před /:id)
router.get('/available-months', authMiddleware, async (req, res) => {
  try {
    if (isTechnician(req.user)) {
      return res.status(403).json({ error: 'Nedostatečná oprávnění' });
    }
    const months = await prisma.workRecord.groupBy({
      by: ['month', 'year'],
      _count: {
        id: true,
      },
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
      ],
    });

    const result = months.map((item) => ({
      month: item.month,
      year: item.year,
      recordsCount: item._count.id,
      label: `${item.month}/${item.year}`,
      monthName: new Date(item.year, item.month - 1).toLocaleDateString('cs-CZ', {
        month: 'long',
        year: 'numeric',
      }),
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching available months:', error);
    res.status(500).json({ error: 'Chyba při načítání dostupných měsíců' });
  }
});

// GET detail záznamu (musí být jako poslední kvůli /:id)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const record = await fetchRecordWithRelations(parseInt(req.params.id, 10));

    if (!record) {
      return res.status(404).json({ error: 'Záznam nenalezen' });
    }

    res.json(enrichRecord(record));
  } catch (error) {
    console.error('Error fetching work record:', error);
    res.status(500).json({ error: 'Chyba při načítání záznamu' });
  }
});

const buildWorkRecordPayload = async (payload, authorId) => {
  const organizationId = parseInt(payload.organizationId, 10);
  if (!organizationId) {
    const error = new Error('Organizace je povinná');
    error.code = 'MISSING_ORG';
    throw error;
  }

  await ensureOrganizationExists(organizationId);

  const recordDate = resolveDate(payload.date);
  const month = recordDate.getMonth() + 1;
  const year = recordDate.getFullYear();

  await assertPeriodUnlocked(prisma, { month, year });

  const minutes = parseMinutes(payload);

  return {
    organizationId,
    date: recordDate,
    worker: payload.worker || 'Neznámý technik',
    description: payload.description || '',
    minutes,
    kilometers: toInt(payload.kilometers),
    timeFrom: payload.timeFrom || null,
    timeTo: payload.timeTo || null,
    branch: payload.branch || null,
    month,
    year,
    projectCode: payload.projectCode || null,
    billingOrgId: payload.billingOrgId ? parseInt(payload.billingOrgId, 10) : organizationId,
    status:
      payload.status && WorkRecordStatus[payload.status]
        ? payload.status
        : WorkRecordStatus.DRAFT,
    userId: authorId || null,
    createdBy: authorId || null,
  };
};

// POST vytvoření záznamu
router.post('/', authMiddleware, authorize('workRecords:write'), async (req, res) => {
  try {
    const requestBody = isTechnician(req.user)
      ? { ...req.body, worker: resolveTechnicianName(req.user) || req.body.worker }
      : req.body;
    const payload = await buildWorkRecordPayload(requestBody, req.user?.id);

    const record = await prisma.workRecord.create({
      data: payload,
      include: {
        organization: true,
        billingOrg: true,
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    const enriched = enrichRecord(record);
    await logAudit(prisma, {
      actorId: req.user?.id,
      entity: 'WorkRecord',
      entityId: record.id,
      action: 'CREATE',
      diff: {
        minutes: enriched.minutes,
        kilometers: enriched.kilometers,
        organizationId: enriched.organizationId,
        date: enriched.date,
      },
    });

    res.status(201).json(enriched);
  } catch (error) {
    if (error.code === 'PERIOD_LOCKED') {
      return res.status(423).json({ error: error.message });
    }
    console.error('Error creating work record:', error);
    res.status(500).json({ error: 'Chyba při vytváření záznamu' });
  }
});

// PUT aktualizace záznamu
router.put('/:id', authMiddleware, authorize('workRecords:write'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await fetchRecordWithRelations(parseInt(id, 10));

    if (!existing) {
      return res.status(404).json({ error: 'Záznam nenalezen' });
    }

    ensureTechnicianOwnership(req.user, existing);

    const mergedPayload = {
      ...existing,
      ...req.body,
    };

    if (isTechnician(req.user)) {
      mergedPayload.worker = resolveTechnicianName(req.user) || existing.worker;
    }

    const updatedPayload = await buildWorkRecordPayload(
      mergedPayload,
      existing.userId || req.user?.id,
    );

    const record = await prisma.workRecord.update({
      where: { id: parseInt(id, 10) },
      data: updatedPayload,
      include: {
        organization: true,
        billingOrg: true,
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    const enriched = enrichRecord(record);
    await logAudit(prisma, {
      actorId: req.user?.id,
      entity: 'WorkRecord',
      entityId: record.id,
      action: 'UPDATE',
      diff: {
        status: enriched.status,
        minutes: enriched.minutes,
        kilometers: enriched.kilometers,
      },
    });

    res.json(enriched);
  } catch (error) {
    if (error.code === 'PERIOD_LOCKED') {
      return res.status(423).json({ error: error.message });
    }
    if (error.code === 'TECHNICIAN_FORBIDDEN') {
      return res.status(403).json({ error: error.message });
    }
    console.error('Error updating work record:', error);
    res.status(500).json({ error: 'Chyba při aktualizaci záznamu' });
  }
});

// POST změna stavu záznamu
router.post('/:id/status', authMiddleware, authorize('workRecords:write'), async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    if (!status || !WorkRecordStatus[status]) {
      return res.status(400).json({ error: 'Neplatný stav záznamu' });
    }

    const existing = await fetchRecordWithRelations(parseInt(id, 10));

    if (!existing) {
      return res.status(404).json({ error: 'Záznam nenalezen' });
    }

    ensureTechnicianOwnership(req.user, existing);

    await assertPeriodUnlocked(prisma, { month: existing.month, year: existing.year });

    const record = await prisma.workRecord.update({
      where: { id: parseInt(id, 10) },
      data: { status },
      include: {
        organization: true,
        billingOrg: true,
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    const enriched = enrichRecord(record);
    await logAudit(prisma, {
      actorId: req.user?.id,
      entity: 'WorkRecord',
      entityId: record.id,
      action: 'STATUS_CHANGE',
      diff: {
        status: enriched.status,
      },
    });

    res.json(enriched);
  } catch (error) {
    if (error.code === 'PERIOD_LOCKED') {
      return res.status(423).json({ error: error.message });
    }
    if (error.code === 'TECHNICIAN_FORBIDDEN') {
      return res.status(403).json({ error: error.message });
    }
    console.error('Error updating work record status:', error);
    res.status(500).json({ error: 'Chyba při změně stavu záznamu' });
  }
});

// DELETE smazání záznamu
router.delete('/:id', authMiddleware, authorize('workRecords:write'), async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await fetchRecordWithRelations(parseInt(id, 10));

    if (!existing) {
      return res.status(404).json({ error: 'Záznam nenalezen' });
    }

    ensureTechnicianOwnership(req.user, existing);

    await assertPeriodUnlocked(prisma, { month: existing.month, year: existing.year });

    await prisma.workRecord.delete({
      where: { id: parseInt(id, 10) },
    });

    await logAudit(prisma, {
      actorId: req.user?.id,
      entity: 'WorkRecord',
      entityId: parseInt(id, 10),
      action: 'DELETE',
      diff: {},
    });

    res.json({ message: 'Záznam smazán' });
  } catch (error) {
    if (error.code === 'PERIOD_LOCKED') {
      return res.status(423).json({ error: error.message });
    }
    if (error.code === 'TECHNICIAN_FORBIDDEN') {
      return res.status(403).json({ error: error.message });
    }
    console.error('Error deleting work record:', error);
    res.status(500).json({ error: 'Chyba při mazání záznamu' });
  }
});

module.exports = router;
