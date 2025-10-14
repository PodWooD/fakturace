const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();

// GET hardware položky s filtrováním
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { organizationId, month, year, status, page = 1, limit = 50 } = req.query;

    const where = {};
    if (organizationId) where.organizationId = parseInt(organizationId);
    if (month) where.month = parseInt(month);
    if (year) where.year = parseInt(year);
    if (status) where.status = status;

    const total = await prisma.hardware.count({ where });

    const hardware = await prisma.hardware.findMany({
      where,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        invoiceItem: {
          select: {
            id: true,
            invoice: {
              select: {
                id: true,
                supplierName: true,
                invoiceNumber: true,
                issueDate: true
              }
            }
          }
        }
      },
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
        { itemName: 'asc' }
      ],
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit)
    });

    res.json({
      data: hardware,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
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
      where: { id: parseInt(req.params.id) },
      include: {
        organization: true
      }
    });

    if (!hardware) {
      return res.status(404).json({ error: 'Hardware nenalezen' });
    }

    res.json(hardware);
  } catch (error) {
    console.error('Error fetching hardware:', error);
    res.status(500).json({ error: 'Chyba při načítání hardware' });
  }
});

// POST vytvoření hardware položky
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      organizationId,
      itemName,
      description,
      quantity,
      unitPrice,
      month,
      year
    } = req.body;

    // Validace
    if (!organizationId || !itemName || !quantity || !unitPrice || !month || !year) {
      return res.status(400).json({ 
        error: 'Organizace, název, množství, cena, měsíc a rok jsou povinné' 
      });
    }

    // Kontrola organizace
    const organization = await prisma.organization.findUnique({
      where: { id: parseInt(organizationId) }
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organizace nenalezena' });
    }

    // Výpočet celkové ceny
    const totalPrice = parseInt(quantity) * parseFloat(unitPrice);

    const hardware = await prisma.hardware.create({
      data: {
        organizationId: parseInt(organizationId),
        itemName,
        description,
        quantity: parseInt(quantity),
        unitPrice: parseFloat(unitPrice),
        totalPrice,
        month: parseInt(month),
        year: parseInt(year),
        status: 'MANUAL'
      },
      include: {
        organization: true
      }
    });

    res.status(201).json(hardware);
  } catch (error) {
    console.error('Error creating hardware:', error);
    res.status(500).json({ error: 'Chyba při vytváření hardware' });
  }
});

// PUT aktualizace hardware položky
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      itemName,
      description,
      quantity,
      unitPrice,
      month,
      year
    } = req.body;

    const existing = await prisma.hardware.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Hardware nenalezen' });
    }

    // Přepočítej celkovou cenu pokud se změnilo množství nebo jednotková cena
    const updateData = {
      itemName,
      description,
      month: month ? parseInt(month) : existing.month,
      year: year ? parseInt(year) : existing.year
    };

    if (quantity !== undefined) {
      updateData.quantity = parseInt(quantity);
    }

    if (unitPrice !== undefined) {
      updateData.unitPrice = parseFloat(unitPrice);
    }

    // Pokud se změnilo množství nebo cena, přepočítej celkovou cenu
    if (quantity !== undefined || unitPrice !== undefined) {
      const newQuantity = quantity !== undefined ? parseInt(quantity) : existing.quantity;
      const newUnitPrice = unitPrice !== undefined ? parseFloat(unitPrice) : parseFloat(existing.unitPrice);
      updateData.totalPrice = newQuantity * newUnitPrice;
    }

    const hardware = await prisma.hardware.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        organization: true
      }
    });

    res.json(hardware);
  } catch (error) {
    console.error('Error updating hardware:', error);
    res.status(500).json({ error: 'Chyba při aktualizaci hardware' });
  }
});

// DELETE smazání hardware položky
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.hardware.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Hardware nenalezen' });
    }

    await prisma.hardware.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Hardware smazán' });
  } catch (error) {
    console.error('Error deleting hardware:', error);
    res.status(500).json({ error: 'Chyba při mazání hardware' });
  }
});

router.post('/:id/mark-invoiced', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const hardware = await prisma.hardware.findUnique({
      where: { id: parseInt(id) }
    });

    if (!hardware) {
      return res.status(404).json({ error: 'Hardware nenalezen' });
    }

    const updated = await prisma.hardware.update({
      where: { id: hardware.id },
      data: {
        status: 'INVOICED',
        assignedAt: hardware.assignedAt || new Date()
      }
    });

    if (updated.sourceInvoiceItemId) {
      await prisma.receivedInvoiceItem.update({
        where: { id: updated.sourceInvoiceItemId },
        data: { status: 'INVOICED' }
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error marking hardware invoiced:', error);
    res.status(500).json({ error: 'Chyba při označení hardware jako vyfakturovaného' });
  }
});

// POST hromadné vytvoření hardware položek
router.post('/bulk', authMiddleware, async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Pole položek je povinné' });
    }

    const createdItems = [];
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const item = items[i];
        
        // Validace
        if (!item.organizationId || !item.itemName || !item.quantity || 
            !item.unitPrice || !item.month || !item.year) {
          errors.push({
            index: i,
            error: 'Chybí povinné údaje'
          });
          continue;
        }

        const totalPrice = parseInt(item.quantity) * parseFloat(item.unitPrice);

        const created = await prisma.hardware.create({
          data: {
            organizationId: parseInt(item.organizationId),
            itemName: item.itemName,
            description: item.description,
            quantity: parseInt(item.quantity),
            unitPrice: parseFloat(item.unitPrice),
            totalPrice,
            month: parseInt(item.month),
            year: parseInt(item.year)
          }
        });

        createdItems.push(created);
      } catch (error) {
        errors.push({
          index: i,
          error: error.message
        });
      }
    }

    res.json({
      created: createdItems.length,
      total: items.length,
      errors,
      items: createdItems
    });
  } catch (error) {
    console.error('Error bulk creating hardware:', error);
    res.status(500).json({ error: 'Chyba při hromadném vytváření hardware' });
  }
});

// GET souhrn hardware za období
router.get('/summary/:organizationId', authMiddleware, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { month, year } = req.query;

    const where = {
      organizationId: parseInt(organizationId)
    };

    if (month) where.month = parseInt(month);
    if (year) where.year = parseInt(year);

    const hardware = await prisma.hardware.findMany({
      where,
      orderBy: [
        { year: 'desc' },
        { month: 'desc' },
        { itemName: 'asc' }
      ]
    });

    // Souhrn
    const summary = hardware.reduce((acc, item) => {
      acc.totalItems += item.quantity;
      acc.totalAmount += parseFloat(item.totalPrice);
      return acc;
    }, {
      totalItems: 0,
      totalAmount: 0,
      itemCount: hardware.length
    });

    res.json({
      hardware,
      summary: {
        ...summary,
        totalAmount: summary.totalAmount.toFixed(2)
      }
    });
  } catch (error) {
    console.error('Error fetching hardware summary:', error);
    res.status(500).json({ error: 'Chyba při načítání souhrnu hardware' });
  }
});

module.exports = router;
