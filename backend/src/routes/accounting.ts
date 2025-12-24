import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import authMiddleware, { authorize } from '../middleware/auth';
import { logAudit } from '../services/auditLogger';

interface AuthRequest extends Request {
    user?: {
        id: number;
        email: string;
        role: string;
        name: string;
    };
}

const router = express.Router();
const prisma = new PrismaClient();

const parsePeriod = (payload: any) => {
    const month = parseInt(payload.month, 10);
    const year = parseInt(payload.year, 10);

    if (!Number.isFinite(month) || !Number.isFinite(year)) {
        const error = new Error('Neplatné období');
        // @ts-ignore
        error.code = 'INVALID_PERIOD';
        throw error;
    }

    return { month, year };
};

router.get('/periods', authMiddleware, async (req: Request, res: Response) => {
    try {
        const periods = await prisma.accountingPeriod.findMany({
            orderBy: [
                { year: 'desc' },
                { month: 'desc' },
            ],
        });

        res.json(periods);
    } catch (error) {
        console.error('Error fetching accounting periods:', error);
        res.status(500).json({ error: 'Chyba při načítání účetních období' });
    }
});

router.post('/lock', authMiddleware, authorize('accounting:lock'), async (req: AuthRequest, res: Response) => {
    try {
        const { month, year } = parsePeriod(req.body);

        const locked = await prisma.accountingPeriod.upsert({
            where: {
                year_month: {
                    month,
                    year,
                },
            },
            update: {
                lockedAt: new Date(),
                lockedBy: req.user?.id || null,
            },
            create: {
                month,
                year,
                lockedAt: new Date(),
                lockedBy: req.user?.id || null,
            },
        });

        await logAudit(prisma, {
            actorId: req.user!.id,
            entity: 'AccountingPeriod',
            entityId: locked.id,
            action: 'LOCK',
            diff: { month, year },
        });

        res.json(locked);
    } catch (error: any) {
        if (error.code === 'INVALID_PERIOD') {
            return res.status(400).json({ error: error.message });
        }
        console.error('Error locking period:', error);
        res.status(500).json({ error: 'Chyba při uzamykání období' });
    }
});

router.post('/unlock', authMiddleware, authorize('accounting:lock'), async (req: AuthRequest, res: Response) => {
    try {
        const { month, year } = parsePeriod(req.body);

        const period = await prisma.accountingPeriod.findUnique({
            where: {
                year_month: {
                    month,
                    year,
                },
            },
        });

        if (!period || !period.lockedAt) {
            return res.status(404).json({ error: 'Období není uzamčeno' });
        }

        const updated = await prisma.accountingPeriod.update({
            where: {
                year_month: {
                    month,
                    year,
                },
            },
            data: {
                lockedAt: null,
                lockedBy: null,
            },
        });

        await logAudit(prisma, {
            actorId: req.user!.id,
            entity: 'AccountingPeriod',
            entityId: updated.id,
            action: 'UNLOCK',
            diff: { month, year },
        });

        res.json(updated);
    } catch (error: any) {
        if (error.code === 'INVALID_PERIOD') {
            return res.status(400).json({ error: error.message });
        }
        console.error('Error unlocking period:', error);
        res.status(500).json({ error: 'Chyba při odemykání období' });
    }
});

export default router;
