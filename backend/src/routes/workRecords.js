const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();

// GET pracovní záznamy s filtrováním
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { month, year, organizationId, worker, page = 1, limit = 50 } = req.query;

    // Sestavení where podmínky
    const where = {};
    
    if (month) where.month = parseInt(month);
    if (year) where.year = parseInt(year);
    if (organizationId) where.organizationId = parseInt(organizationId);
    if (worker) where.worker = { contains: worker, mode: 'insensitive' };

    // Počet záznamů
    const total = await prisma.workRecord.count({ where });

    // Načtení záznamů s pagination
    const records = await prisma.workRecord.findMany({
      where,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
            hourlyRate: true,
            kmRate: true
          }
        },
        billingOrg: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      },
      orderBy: [
        { date: 'desc' },
        { id: 'desc' }
      ],
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit)
    });

    // Výpočet cen
    const recordsWithPrices = records.map(record => {
      const hours = record.minutes / 60;
      const hourlyAmount = hours * parseFloat(record.organization.hourlyRate);
      const kmAmount = record.kilometers * parseFloat(record.organization.kmRate);
      const totalAmount = hourlyAmount + kmAmount;

      return {
        ...record,
        hours: hours.toFixed(2),
        hourlyAmount: hourlyAmount.toFixed(2),
        kmAmount: kmAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2)
      };
    });

    res.json({
      data: recordsWithPrices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching work records:', error);
    res.status(500).json({ error: 'Chyba při načítání pracovních záznamů' });
  }
});

// POST hromadné vytvoření záznamů (musí být před /:id)
router.post('/bulk', authMiddleware, async (req, res) => {
  try {
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Pole záznamů je povinné' });
    }

    const createdRecords = [];
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      try {
        const record = records[i];

        // Převod hodin na minuty
        let totalMinutes = 0;
        if (record.minutes) {
          totalMinutes = parseInt(record.minutes);
        } else if (record.hours) {
          if (typeof record.hours === 'string' && record.hours.includes(':')) {
            const [h, m] = record.hours.split(':');
            totalMinutes = parseInt(h) * 60 + parseInt(m);
          } else {
            totalMinutes = parseFloat(record.hours) * 60;
          }
        } else if (record.timeFrom && record.timeTo) {
          // Pokud je zadán čas od-do, vypočti minuty
          const [fromHours, fromMinutes] = record.timeFrom.split(':').map(n => parseInt(n));
          const [toHours, toMinutes] = record.timeTo.split(':').map(n => parseInt(n));
          const fromTotalMinutes = fromHours * 60 + fromMinutes;
          const toTotalMinutes = toHours * 60 + toMinutes;
          totalMinutes = toTotalMinutes - fromTotalMinutes;

          if (totalMinutes < 0) {
            totalMinutes += 24 * 60; // Pokud přes půlnoc
          }
        }

        const recordDate = new Date(record.date);

        const created = await prisma.workRecord.create({
          data: {
            organizationId: parseInt(record.organizationId),
            date: recordDate,
            worker: record.worker,
            description: record.description,
            minutes: totalMinutes,
            kilometers: parseInt(record.kilometers) || 0,
            timeFrom: record.timeFrom || null,
            timeTo: record.timeTo || null,
            branch: record.branch || null,
            month: recordDate.getMonth() + 1,
            year: recordDate.getFullYear(),
            createdBy: req.user.id
          }
        });

        createdRecords.push(created);
      } catch (error) {
        errors.push({
          index: i,
          error: error.message
        });
      }
    }

    res.json({
      created: createdRecords.length,
      total: records.length,
      errors
    });
  } catch (error) {
    console.error('Error bulk creating work records:', error);
    res.status(500).json({ error: 'Chyba při hromadném vytváření záznamů' });
  }
});

// GET souhrn práce za měsíc (musí být před /:id)
router.get('/summary/:year/:month', authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.params;
    const { groupBy = 'billing' } = req.query; // 'billing' nebo 'workplace' pro seskupení podle pracoviště

    // Seskupit podle billingOrgId (výchozí) nebo organizationId
    const groupByField = groupBy === 'workplace' ? 'organizationId' : 'billingOrgId';
    
    const summary = await prisma.workRecord.groupBy({
      by: [groupByField],
      where: {
        month: parseInt(month),
        year: parseInt(year)
      },
      _sum: {
        minutes: true,
        kilometers: true
      },
      _count: {
        id: true
      }
    });

    // Načtení organizací
    const organizationIds = summary.map(s => s[groupByField]).filter(id => id !== null);
    const organizations = await prisma.organization.findMany({
      where: {
        id: { in: organizationIds }
      }
    });

    // Načíst faktury pro daný měsíc
    const invoices = await prisma.invoice.findMany({
      where: {
        month: parseInt(month),
        year: parseInt(year),
        organizationId: { in: organizationIds }
      },
      select: {
        organizationId: true,
        status: true,
        invoiceNumber: true
      }
    });

    // Vytvořit mapu faktur podle organizace
    const invoicesByOrg = invoices.reduce((acc, inv) => {
      acc[inv.organizationId] = inv;
      return acc;
    }, {});

    // Mapování výsledků s výpočtem cen
    const result = summary.map(item => {
      const orgId = item[groupByField];
      const org = organizations.find(o => o.id === orgId);
      
      if (!org) return null;
      
      const hours = (item._sum.minutes || 0) / 60;
      const hourlyAmount = hours * parseFloat(org.hourlyRate);
      const kmAmount = (item._sum.kilometers || 0) * parseFloat(org.kmRate);
      
      // Najdi fakturu pro tuto organizaci
      const invoice = invoicesByOrg[orgId];

      return {
        organization: org,
        recordsCount: item._count.id,
        totalHours: hours.toFixed(2),
        totalKm: item._sum.kilometers || 0,
        hourlyAmount: hourlyAmount.toFixed(2),
        kmAmount: kmAmount.toFixed(2),
        totalAmount: (hourlyAmount + kmAmount).toFixed(2),
        invoice: invoice ? {
          status: invoice.status,
          invoiceNumber: invoice.invoiceNumber
        } : null
      };
    }).filter(item => item !== null);

    res.json(result);
  } catch (error) {
    console.error('Error fetching work summary:', error);
    res.status(500).json({ error: 'Chyba při načítání souhrnu' });
  }
});

// GET dostupné měsíce s daty (musí být před /:id)
router.get('/available-months', authMiddleware, async (req, res) => {
  try {
    const months = await prisma.workRecord.groupBy({
      by: ['month', 'year'],
      _count: {
        id: true
      },
      orderBy: [
        { year: 'desc' },
        { month: 'desc' }
      ]
    });

    // Formátování výsledků
    const result = months.map(item => ({
      month: item.month,
      year: item.year,
      recordsCount: item._count.id,
      label: `${item.month}/${item.year}`,
      monthName: new Date(item.year, item.month - 1).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })
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
    const record = await prisma.workRecord.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        organization: true,
        billingOrg: true
      }
    });

    if (!record) {
      return res.status(404).json({ error: 'Záznam nenalezen' });
    }

    res.json(record);
  } catch (error) {
    console.error('Error fetching work record:', error);
    res.status(500).json({ error: 'Chyba při načítání záznamu' });
  }
});

// POST vytvoření záznamu
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      organizationId,
      date,
      worker,
      description,
      hours,
      minutes,
      kilometers,
      timeFrom,
      timeTo,
      branch
    } = req.body;

    // Validace povinných polí
    if (!organizationId || !date || !worker || !description) {
      return res.status(400).json({
        error: 'Organizace, datum, pracovník a popis jsou povinné'
      });
    }

    // Převod hodin na minuty
    let totalMinutes = 0;
    if (minutes) {
      totalMinutes = parseInt(minutes);
    } else if (hours) {
      // Podpora formátu "HH:MM" nebo desetinného čísla
      if (typeof hours === 'string' && hours.includes(':')) {
        const [h, m] = hours.split(':');
        totalMinutes = parseInt(h) * 60 + parseInt(m);
      } else {
        totalMinutes = parseFloat(hours) * 60;
      }
    } else if (timeFrom && timeTo) {
      // Pokud je zadán čas od-do, vypočti minuty
      const [fromHours, fromMinutes] = timeFrom.split(':').map(n => parseInt(n));
      const [toHours, toMinutes] = timeTo.split(':').map(n => parseInt(n));
      const fromTotalMinutes = fromHours * 60 + fromMinutes;
      const toTotalMinutes = toHours * 60 + toMinutes;
      totalMinutes = toTotalMinutes - fromTotalMinutes;

      if (totalMinutes < 0) {
        totalMinutes += 24 * 60; // Pokud přes půlnoc
      }
    }

    // Extrakce měsíce a roku z data
    const recordDate = new Date(date);
    const month = recordDate.getMonth() + 1;
    const year = recordDate.getFullYear();

    const record = await prisma.workRecord.create({
      data: {
        organizationId: parseInt(organizationId),
        date: recordDate,
        worker,
        description,
        minutes: totalMinutes,
        kilometers: parseInt(kilometers) || 0,
        timeFrom: timeFrom || null,
        timeTo: timeTo || null,
        branch: branch || null,
        month,
        year,
        projectCode: req.body.projectCode || null,
        billingOrgId: req.body.billingOrgId ? parseInt(req.body.billingOrgId) : parseInt(organizationId),
        createdBy: req.user.id
      },
      include: {
        organization: true,
        billingOrg: true
      }
    });

    res.status(201).json(record);
  } catch (error) {
    console.error('Error creating work record:', error);
    res.status(500).json({ error: 'Chyba při vytváření záznamu' });
  }
});

// PUT aktualizace záznamu
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      organizationId,
      date,
      worker,
      description,
      hours,
      minutes,
      kilometers,
      timeFrom,
      timeTo,
      branch
    } = req.body;

    // Kontrola existence
    const existing = await prisma.workRecord.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Záznam nenalezen' });
    }

    // Převod hodin na minuty
    let totalMinutes = existing.minutes;
    if (minutes !== undefined) {
      totalMinutes = parseInt(minutes);
    } else if (hours !== undefined) {
      if (typeof hours === 'string' && hours.includes(':')) {
        const [h, m] = hours.split(':');
        totalMinutes = parseInt(h) * 60 + parseInt(m);
      } else {
        totalMinutes = parseFloat(hours) * 60;
      }
    } else if (timeFrom !== undefined && timeTo !== undefined && timeFrom && timeTo) {
      // Pokud je zadán čas od-do, vypočti minuty
      const [fromHours, fromMinutes] = timeFrom.split(':').map(n => parseInt(n));
      const [toHours, toMinutes] = timeTo.split(':').map(n => parseInt(n));
      const fromTotalMinutes = fromHours * 60 + fromMinutes;
      const toTotalMinutes = toHours * 60 + toMinutes;
      totalMinutes = toTotalMinutes - fromTotalMinutes;

      if (totalMinutes < 0) {
        totalMinutes += 24 * 60; // Pokud přes půlnoc
      }
    }

    // Aktualizace měsíce a roku pokud se změnilo datum
    const updateData = {
      worker,
      description,
      minutes: totalMinutes,
      kilometers: kilometers !== undefined ? parseInt(kilometers) : existing.kilometers
    };

    if (organizationId) {
      updateData.organizationId = parseInt(organizationId);
    }

    if (date) {
      const recordDate = new Date(date);
      updateData.date = recordDate;
      updateData.month = recordDate.getMonth() + 1;
      updateData.year = recordDate.getFullYear();
    }

    // Přidej billingOrgId, projectCode, timeFrom, timeTo a branch pokud jsou v požadavku
    if (req.body.billingOrgId !== undefined) {
      updateData.billingOrgId = req.body.billingOrgId ? parseInt(req.body.billingOrgId) : null;
    }
    if (req.body.projectCode !== undefined) {
      updateData.projectCode = req.body.projectCode;
    }
    if (timeFrom !== undefined) {
      updateData.timeFrom = timeFrom || null;
    }
    if (timeTo !== undefined) {
      updateData.timeTo = timeTo || null;
    }
    if (branch !== undefined) {
      updateData.branch = branch || null;
    }

    const record = await prisma.workRecord.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        organization: true,
        billingOrg: true
      }
    });

    res.json(record);
  } catch (error) {
    console.error('Error updating work record:', error);
    res.status(500).json({ error: 'Chyba při aktualizaci záznamu' });
  }
});

// DELETE smazání záznamu
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.workRecord.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Záznam nenalezen' });
    }

    await prisma.workRecord.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Záznam smazán' });
  } catch (error) {
    console.error('Error deleting work record:', error);
    res.status(500).json({ error: 'Chyba při mazání záznamu' });
  }
});

module.exports = router;