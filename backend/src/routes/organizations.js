const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();

// GET všechny organizace
router.get('/', authMiddleware, async (req, res) => {
  try {
    const organizations = await prisma.organization.findMany({
      include: {
        services: {
          where: { isActive: true }
        },
        _count: {
          select: {
            workRecords: true,
            invoices: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    res.json({
      data: organizations,
      total: organizations.length
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
      where: { id: parseInt(req.params.id) },
      include: {
        services: true,
        workRecords: {
          orderBy: { date: 'desc' },
          take: 10
        },
        invoices: {
          orderBy: { generatedAt: 'desc' },
          take: 5
        }
      }
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organizace nenalezena' });
    }

    res.json(organization);
  } catch (error) {
    console.error('Error fetching organization:', error);
    res.status(500).json({ error: 'Chyba při načítání organizace' });
  }
});

// POST vytvoření organizace
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      name,
      code,
      contactPerson,
      hourlyRate,
      kmRate,
      address,
      ico,
      dic,
      email,
      phone
    } = req.body;

    // Validace povinných polí
    if (!name || !hourlyRate || !kmRate) {
      return res.status(400).json({ 
        error: 'Název, hodinová sazba a sazba za km jsou povinné' 
      });
    }

    // Kontrola unikátního kódu
    if (code) {
      const existing = await prisma.organization.findUnique({
        where: { code }
      });
      if (existing) {
        return res.status(400).json({ error: 'Kód organizace již existuje' });
      }
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        code: code || undefined,
        contactPerson,
        hourlyRate,
        kmRate,
        address,
        ico,
        dic,
        email,
        phone,
        createdBy: req.user.id
      }
    });

    res.status(201).json(organization);
  } catch (error) {
    console.error('Error creating organization:', error);
    res.status(500).json({ error: 'Chyba při vytváření organizace' });
  }
});

// PUT aktualizace organizace
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      code,
      contactPerson,
      hourlyRate,
      kmRate,
      address,
      ico,
      dic,
      email,
      phone
    } = req.body;

    // Kontrola existence
    const existing = await prisma.organization.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Organizace nenalezena' });
    }

    // Kontrola unikátního kódu
    if (code && code !== existing.code) {
      const codeExists = await prisma.organization.findUnique({
        where: { code }
      });
      if (codeExists) {
        return res.status(400).json({ error: 'Kód organizace již existuje' });
      }
    }

    const organization = await prisma.organization.update({
      where: { id: parseInt(id) },
      data: {
        name,
        code,
        contactPerson,
        hourlyRate,
        kmRate,
        address,
        ico,
        dic,
        email,
        phone
      }
    });

    res.json(organization);
  } catch (error) {
    console.error('Error updating organization:', error);
    res.status(500).json({ error: 'Chyba při aktualizaci organizace' });
  }
});

// DELETE smazání organizace
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Kontrola závislostí
    const org = await prisma.organization.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: {
          select: {
            workRecords: true,
            invoices: true,
            services: true,
            hardware: true
          }
        }
      }
    });

    if (!org) {
      return res.status(404).json({ error: 'Organizace nenalezena' });
    }

    // Kontrola, zda organizace nemá závislosti
    const hasRecords = Object.values(org._count).some(count => count > 0);
    if (hasRecords) {
      return res.status(400).json({ 
        error: 'Organizaci nelze smazat, obsahuje záznamy' 
      });
    }

    await prisma.organization.delete({
      where: { id: parseInt(id) }
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
      organizationId: parseInt(id)
    };

    if (month && year) {
      where.month = parseInt(month);
      where.year = parseInt(year);
    }

    const [workRecords, services, hardware, invoices] = await Promise.all([
      // Pracovní záznamy
      prisma.workRecord.aggregate({
        where,
        _sum: {
          minutes: true,
          kilometers: true
        },
        _count: {
          id: true
        }
      }),
      // Paušální služby
      prisma.service.findMany({
        where: {
          organizationId: parseInt(id),
          isActive: true
        }
      }),
      // Hardware
      prisma.hardware.aggregate({
        where: {
          organizationId: parseInt(id),
          ...(month && year && { month: parseInt(month), year: parseInt(year) })
        },
        _sum: {
          totalPrice: true
        }
      }),
      // Faktury
      prisma.invoice.findMany({
        where: {
          organizationId: parseInt(id),
          ...(month && year && { month: parseInt(month), year: parseInt(year) })
        },
        select: {
          status: true,
          totalAmount: true
        }
      })
    ]);

    // Výpočet celkové částky
    const organization = await prisma.organization.findUnique({
      where: { id: parseInt(id) },
      select: { hourlyRate: true, kmRate: true }
    });

    const workHours = (workRecords._sum.minutes || 0) / 60;
    const workAmount = workHours * parseFloat(organization.hourlyRate);
    const kmAmount = (workRecords._sum.kilometers || 0) * parseFloat(organization.kmRate);
    const servicesAmount = services.reduce((sum, s) => sum + parseFloat(s.monthlyPrice), 0);
    const hardwareAmount = parseFloat(hardware._sum.totalPrice || 0);

    res.json({
      workRecords: {
        count: workRecords._count.id,
        totalHours: workHours.toFixed(2),
        totalKm: workRecords._sum.kilometers || 0,
        amount: workAmount.toFixed(2)
      },
      services: {
        count: services.length,
        amount: servicesAmount.toFixed(2)
      },
      hardware: {
        amount: hardwareAmount.toFixed(2)
      },
      kmAmount: kmAmount.toFixed(2),
      totalAmount: (workAmount + kmAmount + servicesAmount + hardwareAmount).toFixed(2),
      invoices: invoices
    });
  } catch (error) {
    console.error('Error fetching organization stats:', error);
    res.status(500).json({ error: 'Chyba při načítání statistik' });
  }
});

module.exports = router;
