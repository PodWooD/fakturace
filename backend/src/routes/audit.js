const express = require('express');

const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { authorize } = authMiddleware;

const prisma = new PrismaClient();

router.get('/', authMiddleware, authorize('system:audit'), async (req, res) => {
  try {
    const {
      entity,
      entityId,
      actorId,
      page = 1,
      limit = 50,
    } = req.query;

    const where = {};
    if (entity) where.entity = entity;
    if (entityId) where.entityId = parseInt(entityId, 10);
    if (actorId) where.actorId = parseInt(actorId, 10);

    const total = await prisma.auditLog.count({ where });

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
      take: parseInt(limit, 10),
    });

    res.json({
      data: logs,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Chyba při načítání auditních záznamů' });
  }
});

module.exports = router;
