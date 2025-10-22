const express = require('express');

const router = express.Router();
const {
  PrismaClient,
  HardwareStatus,
  ReceivedInvoiceItemStatus,
  Prisma,
} = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { authorize } = authMiddleware;
const { toCents, fromCents, normalizeNumber } = require('../utils/money');
const { assertPeriodUnlocked } = require('../utils/accounting');
const { logAudit } = require('../services/auditLogger');
const { assignInvoiceItem, AssignmentError } = require('../services/hardwareAssignment');

const prisma = new PrismaClient();

const mapHardware = (hardware) => ({
  ...hardware,
  unitPrice: fromCents(hardware.unitPriceCents),
  totalPrice: fromCents(hardware.totalPriceCents),
});

const mapSplitItem = (item) => ({
  id: item.id,
  invoiceId: item.invoiceId,
  itemName: item.itemName,
  description: item.description,
  productCode: item.productCode,
  referenceProductCode: item.referenceProductCode,
  quantity: normalizeNumber(item.quantity ? item.quantity.toString() : null),
  unitPrice: fromCents(item.unitPriceCents),
  totalPrice: fromCents(item.totalPriceCents),
  vatRate: item.vatRate,
  status: item.status,
});

const ensureSplittableStatus = (status) => {
  return (
    status === ReceivedInvoiceItemStatus.PENDING ||
    status === ReceivedInvoiceItemStatus.APPROVED
  );
};

router.post('/split', authMiddleware, authorize('hardware:write'), async (req, res) => {
  try {
    const { itemId } = req.body;
    const parsedItemId = parseInt(itemId, 10);

    if (!parsedItemId) {
      return res.status(400).json({ error: 'itemId je povinný parametr' });
    }

    const item = await prisma.receivedInvoiceItem.findUnique({
      where: { id: parsedItemId },
    });

    if (!item) {
      return res.status(404).json({ error: 'Položka nenalezena' });
    }

    if (!ensureSplittableStatus(item.status)) {
      return res.status(400).json({ error: 'Položku v tomto stavu nelze rozdělit' });
    }

    const quantityValue = normalizeNumber(item.quantity ? item.quantity.toString() : null);
    const totalUnits = Math.round(quantityValue || 0);

    if (!totalUnits || totalUnits <= 1) {
      return res.status(400).json({ error: 'Položku nelze rozdělit na menší části' });
    }

    if (Math.abs(totalUnits - (quantityValue || 0)) > 1e-6) {
      return res.status(400).json({ error: 'Položku lze rozdělit pouze na celé kusy' });
    }

    const totalPriceCents =
      item.totalPriceCents ??
      (item.unitPriceCents ? item.unitPriceCents * totalUnits : 0);

    const baseUnitPrice = Math.floor(totalPriceCents / totalUnits);
    let remainder = totalPriceCents - baseUnitPrice * totalUnits;

    const priceSplits = Array.from({ length: totalUnits }, (_, index) => {
      const extra = index < remainder ? 1 : 0;
      return baseUnitPrice + extra;
    });

    const baseName = item.itemName || 'Položka';
    const statusToUse = ensureSplittableStatus(item.status)
      ? item.status
      : ReceivedInvoiceItemStatus.PENDING;

    const parts = [];

    await prisma.$transaction(async (tx) => {
      const updated = await tx.receivedInvoiceItem.update({
        where: { id: parsedItemId },
        data: {
          itemName: `${baseName} (1/${totalUnits})`,
          quantity: new Prisma.Decimal(1),
          unitPriceCents: priceSplits[0] ?? 0,
          totalPriceCents: priceSplits[0] ?? 0,
          status: statusToUse,
          assignedOrganizationId: null,
          assignedMonth: null,
          assignedYear: null,
          referenceProductCode: item.referenceProductCode || null,
        },
      });

      parts.push(updated);

      for (let index = 1; index < totalUnits; index += 1) {
        const created = await tx.receivedInvoiceItem.create({
          data: {
            invoiceId: item.invoiceId,
            itemName: `${baseName} (${index + 1}/${totalUnits})`,
            description: item.description,
            productCode: item.productCode,
            referenceProductCode: item.referenceProductCode || null,
            quantity: new Prisma.Decimal(1),
            unitPriceCents: priceSplits[index] ?? 0,
            totalPriceCents: priceSplits[index] ?? 0,
            vatRate: item.vatRate,
            status: statusToUse,
          },
        });
        parts.push(created);
      }
    });

    await logAudit(prisma, {
      actorId: req.user?.id,
      entity: 'ReceivedInvoiceItem',
      entityId: parsedItemId,
      action: 'SPLIT',
      diff: {
        parts: parts.map((part) => part.id),
        totalUnits,
      },
    });

    res.json({
      parts: parts.map(mapSplitItem),
      totalUnits,
    });
  } catch (error) {
    console.error('Error splitting invoice item:', error);
    res.status(500).json({ error: 'Chyba při rozdělení položky' });
  }
});

router.post('/assign', authMiddleware, authorize('hardware:write'), async (req, res) => {
  try {
    const { itemId, organizationId, month, year, status } = req.body;
    const parsedItemId = parseInt(itemId, 10);

    if (!parsedItemId) {
      return res.status(400).json({ error: 'itemId je povinný parametr' });
    }

    const { hardware } = await assignInvoiceItem({
      prisma,
      itemId: parsedItemId,
      organizationId,
      month,
      year,
      status,
    });

    const mappedHardware = mapHardware(hardware);

    await logAudit(prisma, {
      actorId: req.user?.id,
      entity: 'ReceivedInvoiceItem',
      entityId: parsedItemId,
      action: 'ASSIGN',
      diff: {
        organizationId,
        month,
        year,
        hardwareId: hardware.id,
      },
    });

    res.json({ hardware: mappedHardware });
  } catch (error) {
    if (error instanceof AssignmentError) {
      return res.status(error.statusCode || 400).json({ error: error.message, code: error.code });
    }
    if (error.code === 'PERIOD_LOCKED') {
      return res.status(423).json({ error: error.message });
    }
    console.error('Error assigning invoice item (hardware route):', error);
    res.status(500).json({ error: 'Chyba při přiřazení položky' });
  }
});

// GET hardware položky s filtrováním
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { organizationId, month, year, status, page = 1, limit = 50 } = req.query;

    const where = {};
    if (organizationId) where.organizationId = parseInt(organizationId, 10);
    if (month) where.month = parseInt(month, 10);
    if (year) where.year = parseInt(year, 10);
    if (status) where.status = status;

    const total = await prisma.hardware.count({ where });

    const hardware = await prisma.hardware.findMany({
      where,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        sourceInvoiceItem: {
          include: {
            invoice: {
              select: {
                id: true,
                supplierName: true,
                invoiceNumber: true,
                issueDate: true,
              },
            },
          },
        },
      },
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
        { itemName: 'asc' },
      ],
      skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
      take: parseInt(limit, 10),
    });

    res.json({
      data: hardware.map(mapHardware),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    console.error('Error fetching hardware:', error);
    res.status(500).json({ error: 'Chyba při načítání hardware' });
  }
});

// GET detail hardware položky
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const hardware = await prisma.hardware.findUnique({
      where: { id: parseInt(req.params.id, 10) },
      include: {
        organization: true,
        sourceInvoiceItem: {
          include: {
            invoice: true,
          },
        },
      },
    });

    if (!hardware) {
      return res.status(404).json({ error: 'Hardware nenalezen' });
    }

    res.json(mapHardware(hardware));
  } catch (error) {
    console.error('Error fetching hardware:', error);
    res.status(500).json({ error: 'Chyba při načítání hardware' });
  }
});

const buildHardwarePayload = async (body) => {
  const organizationId = parseInt(body.organizationId, 10);
  if (!organizationId) {
    const error = new Error('Organizace je povinná');
    error.code = 'MISSING_ORG';
    throw error;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    const error = new Error('Organizace nenalezena');
    error.code = 'ORG_NOT_FOUND';
    throw error;
  }

  const quantity = Number.isFinite(Number(body.quantity))
    ? Math.max(parseInt(body.quantity, 10), 1)
    : 1;

  if (!body.itemName || !body.month || !body.year) {
    const error = new Error('Název položky, měsíc a rok jsou povinné');
    error.code = 'MISSING_FIELDS';
    throw error;
  }

  const month = parseInt(body.month, 10);
  const year = parseInt(body.year, 10);

  await assertPeriodUnlocked(prisma, { month, year });

  const unitPriceCents = toCents(body.unitPrice ?? body.unitPriceCents ?? 0);
  if (unitPriceCents === null) {
    const error = new Error('Neplatná jednotková cena');
    error.code = 'INVALID_PRICE';
    throw error;
  }

  const explicitTotal = body.totalPrice ?? body.totalPriceCents;
  const totalPriceCents =
    explicitTotal !== undefined && explicitTotal !== null
      ? toCents(explicitTotal)
      : unitPriceCents * quantity;

  return {
    organizationId,
    itemName: body.itemName,
    description: body.description || null,
    quantity,
    unitPriceCents,
    totalPriceCents,
    vatRate: body.vatRate !== undefined ? parseInt(body.vatRate, 10) : 0,
    status:
      body.status && HardwareStatus[body.status] ? body.status : HardwareStatus.ASSIGNED,
    month,
    year,
    assignedAt: body.assignedAt ? new Date(body.assignedAt) : new Date(),
    sourceInvoiceItemId: body.sourceInvoiceItemId
      ? parseInt(body.sourceInvoiceItemId, 10)
      : null,
  };
};

// POST vytvoření hardware položky
router.post('/', authMiddleware, authorize('hardware:write'), async (req, res) => {
  try {
    const payload = await buildHardwarePayload(req.body);

    const hardware = await prisma.hardware.create({
      data: payload,
      include: {
        organization: true,
        sourceInvoiceItem: {
          include: {
            invoice: true,
          },
        },
      },
    });

    const mapped = mapHardware(hardware);
    await logAudit(prisma, {
      actorId: req.user?.id,
      entity: 'Hardware',
      entityId: hardware.id,
      action: 'CREATE',
      diff: mapped,
    });

    res.status(201).json(mapped);
  } catch (error) {
    if (error.code === 'PERIOD_LOCKED') {
      return res.status(423).json({ error: error.message });
    }
    console.error('Error creating hardware:', error);
    res.status(500).json({ error: 'Chyba při vytváření hardware' });
  }
});

// PUT aktualizace hardware položky
router.put('/:id', authMiddleware, authorize('hardware:write'), async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.hardware.findUnique({
      where: { id: parseInt(id, 10) },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Hardware nenalezen' });
    }

    await assertPeriodUnlocked(prisma, { month: existing.month, year: existing.year });

    const payload = await buildHardwarePayload({
      ...existing,
      ...req.body,
      organizationId: req.body.organizationId || existing.organizationId,
    });

    const hardware = await prisma.hardware.update({
      where: { id: parseInt(id, 10) },
      data: payload,
      include: {
        organization: true,
        sourceInvoiceItem: {
          include: {
            invoice: true,
          },
        },
      },
    });

    const mapped = mapHardware(hardware);
    await logAudit(prisma, {
      actorId: req.user?.id,
      entity: 'Hardware',
      entityId: hardware.id,
      action: 'UPDATE',
      diff: mapped,
    });

    res.json(mapped);
  } catch (error) {
    if (error.code === 'PERIOD_LOCKED') {
      return res.status(423).json({ error: error.message });
    }
    console.error('Error updating hardware:', error);
    res.status(500).json({ error: 'Chyba při aktualizaci hardware' });
  }
});

// POST změna stavu hardware
router.post('/:id/status', authMiddleware, authorize('hardware:write'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !HardwareStatus[status]) {
      return res.status(400).json({ error: 'Neplatný stav hardware' });
    }

    const existing = await prisma.hardware.findUnique({
      where: { id: parseInt(id, 10) },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Hardware nenalezen' });
    }

    await assertPeriodUnlocked(prisma, { month: existing.month, year: existing.year });

    const hardware = await prisma.hardware.update({
      where: { id: parseInt(id, 10) },
      data: { status },
      include: {
        organization: true,
        sourceInvoiceItem: {
          include: {
            invoice: true,
          },
        },
      },
    });

    const mapped = mapHardware(hardware);
    await logAudit(prisma, {
      actorId: req.user?.id,
      entity: 'Hardware',
      entityId: hardware.id,
      action: 'STATUS_CHANGE',
      diff: { status },
    });

    res.json(mapped);
  } catch (error) {
    if (error.code === 'PERIOD_LOCKED') {
      return res.status(423).json({ error: error.message });
    }
    console.error('Error updating hardware status:', error);
    res.status(500).json({ error: 'Chyba při změně stavu hardware' });
  }
});

// DELETE smazání hardware položky
router.delete('/:id', authMiddleware, authorize('hardware:write'), async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.hardware.findUnique({
      where: { id: parseInt(id, 10) },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Hardware nenalezen' });
    }

    await assertPeriodUnlocked(prisma, { month: existing.month, year: existing.year });

    await prisma.hardware.delete({
      where: { id: parseInt(id, 10) },
    });

    await logAudit(prisma, {
      actorId: req.user?.id,
      entity: 'Hardware',
      entityId: parseInt(id, 10),
      action: 'DELETE',
      diff: {},
    });

    res.json({ message: 'Hardware smazán' });
  } catch (error) {
    if (error.code === 'PERIOD_LOCKED') {
      return res.status(423).json({ error: error.message });
    }
    console.error('Error deleting hardware:', error);
    res.status(500).json({ error: 'Chyba při mazání hardware' });
  }
});

module.exports = router;
