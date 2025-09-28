const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();

// GET všechny služby
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { organizationId, isActive } = req.query;
    
    const where = {};
    if (organizationId) where.organizationId = parseInt(organizationId);
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const services = await prisma.service.findMany({
      where,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      },
      orderBy: [
        { organizationId: 'asc' },
        { serviceName: 'asc' }
      ]
    });

    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Chyba při načítání služeb' });
  }
});

// GET detail služby
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        organization: true
      }
    });

    if (!service) {
      return res.status(404).json({ error: 'Služba nenalezena' });
    }

    res.json(service);
  } catch (error) {
    console.error('Error fetching service:', error);
    res.status(500).json({ error: 'Chyba při načítání služby' });
  }
});

// POST vytvoření služby
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      organizationId,
      serviceName,
      description,
      monthlyPrice,
      isActive = true
    } = req.body;

    // Validace
    if (!organizationId || !serviceName || !monthlyPrice) {
      return res.status(400).json({ 
        error: 'Organizace, název služby a měsíční cena jsou povinné' 
      });
    }

    // Kontrola, zda organizace existuje
    const organization = await prisma.organization.findUnique({
      where: { id: parseInt(organizationId) }
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organizace nenalezena' });
    }

    const service = await prisma.service.create({
      data: {
        organizationId: parseInt(organizationId),
        serviceName,
        description,
        monthlyPrice,
        isActive
      },
      include: {
        organization: true
      }
    });

    res.status(201).json(service);
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ error: 'Chyba při vytváření služby' });
  }
});

// PUT aktualizace služby
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      serviceName,
      description,
      monthlyPrice,
      isActive
    } = req.body;

    const existing = await prisma.service.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Služba nenalezena' });
    }

    const service = await prisma.service.update({
      where: { id: parseInt(id) },
      data: {
        serviceName,
        description,
        monthlyPrice,
        isActive
      },
      include: {
        organization: true
      }
    });

    res.json(service);
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ error: 'Chyba při aktualizaci služby' });
  }
});

// DELETE smazání služby
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.service.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Služba nenalezena' });
    }

    await prisma.service.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Služba smazána' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: 'Chyba při mazání služby' });
  }
});

// POST hromadné vytvoření služeb
router.post('/bulk', authMiddleware, async (req, res) => {
  try {
    const { organizationId, services } = req.body;

    if (!organizationId || !Array.isArray(services)) {
      return res.status(400).json({ 
        error: 'ID organizace a pole služeb jsou povinné' 
      });
    }

    // Kontrola organizace
    const organization = await prisma.organization.findUnique({
      where: { id: parseInt(organizationId) }
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organizace nenalezena' });
    }

    const createdServices = [];
    const errors = [];

    for (let i = 0; i < services.length; i++) {
      try {
        const service = services[i];
        
        if (!service.serviceName || !service.monthlyPrice) {
          errors.push({
            index: i,
            error: 'Název a cena jsou povinné'
          });
          continue;
        }

        const created = await prisma.service.create({
          data: {
            organizationId: parseInt(organizationId),
            serviceName: service.serviceName,
            description: service.description,
            monthlyPrice: service.monthlyPrice,
            isActive: service.isActive !== false
          }
        });

        createdServices.push(created);
      } catch (error) {
        errors.push({
          index: i,
          error: error.message
        });
      }
    }

    res.json({
      created: createdServices.length,
      total: services.length,
      errors,
      services: createdServices
    });
  } catch (error) {
    console.error('Error bulk creating services:', error);
    res.status(500).json({ error: 'Chyba při hromadném vytváření služeb' });
  }
});

// GET služby organizace
router.get('/organization/:organizationId', authMiddleware, async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { isActive } = req.query;

    const where = {
      organizationId: parseInt(organizationId)
    };
    
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const services = await prisma.service.findMany({
      where,
      orderBy: {
        serviceName: 'asc'
      }
    });

    // Spočítej celkovou měsíční částku
    const totalMonthlyPrice = services
      .filter(s => s.isActive)
      .reduce((sum, service) => sum + parseFloat(service.monthlyPrice), 0);

    res.json({
      services,
      totalMonthlyPrice: totalMonthlyPrice.toFixed(2),
      activeCount: services.filter(s => s.isActive).length,
      totalCount: services.length
    });
  } catch (error) {
    console.error('Error fetching organization services:', error);
    res.status(500).json({ error: 'Chyba při načítání služeb organizace' });
  }
});

module.exports = router;