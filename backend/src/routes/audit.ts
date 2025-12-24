import express, { Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import authMiddleware, { authorize } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', authMiddleware, authorize('system:audit'), async (req: Request, res: Response) => {
    try {
        const {
            entity,
            entityId,
            actorId,
            page = '1',
            limit = '50',
        } = req.query;

        const where: Prisma.AuditLogWhereInput = {};
        if (entity) where.entity = String(entity);
        if (entityId) where.entityId = parseInt(String(entityId), 10);
        if (actorId) where.actorId = parseInt(String(actorId), 10);

        const total = await prisma.auditLog.count({ where });

        const pageNum = parseInt(String(page), 10);
        const limitNum = parseInt(String(limit), 10);

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
            skip: (pageNum - 1) * limitNum,
            take: limitNum,
        });

        res.json({
            data: logs,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ error: 'Chyba při načítání auditních záznamů' });
    }
});

export default router;
