import express, { Request, Response } from 'express';
import { PrismaClient, Service } from '@prisma/client';
import authMiddleware, { authorize } from '../middleware/auth';
import { toCents, fromCents } from '../utils/money';
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

const mapService = (service: Service) => ({
    ...service,
    monthlyPrice: fromCents(service.monthlyPriceCents),
});

// GET všechny služby
router.get('/', authMiddleware, authorize('billing:read'), async (req: Request, res: Response) => {
    try {
        const { organizationId, isActive } = req.query;

        const where: any = {};
        if (organizationId) where.organizationId = parseInt(String(organizationId), 10);
        if (isActive !== undefined) where.isActive = isActive === 'true';

        const services = await prisma.service.findMany({
            where,
            include: {
                organization: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
            orderBy: [
                { organizationId: 'asc' },
                { serviceName: 'asc' },
            ],
        });

        res.json(services.map(mapService));
    } catch (error) {
        console.error('Error fetching services:', error);
        res.status(500).json({ error: 'Chyba při načítání služeb' });
    }
});

// GET detail služby
router.get('/:id', authMiddleware, authorize('billing:read'), async (req: Request, res: Response) => {
    try {
        const service = await prisma.service.findUnique({
            where: { id: parseInt(req.params.id, 10) },
            include: {
                organization: true,
            },
        });

        if (!service) {
            return res.status(404).json({ error: 'Služba nenalezena' });
        }

        res.json(mapService(service));
    } catch (error) {
        console.error('Error fetching service:', error);
        res.status(500).json({ error: 'Chyba při načítání služby' });
    }
});

// POST vytvoření služby
router.post('/', authMiddleware, authorize('billing:write'), async (req: AuthRequest, res: Response) => {
    try {
        const { organizationId, serviceName, description, monthlyPrice, isActive = true } = req.body;

        if (!organizationId || !serviceName || monthlyPrice === undefined) {
            return res.status(400).json({
                error: 'Organizace, název služby a měsíční cena jsou povinné',
            });
        }

        const organization = await prisma.organization.findUnique({
            where: { id: parseInt(organizationId, 10) },
        });

        if (!organization) {
            return res.status(404).json({ error: 'Organizace nenalezena' });
        }

        const service = await prisma.service.create({
            data: {
                organizationId: parseInt(organizationId, 10),
                serviceName,
                description: description || null,
                monthlyPriceCents: toCents(monthlyPrice) ?? 0,
                isActive: Boolean(isActive),
            },
            include: {
                organization: true,
            },
        });

        await logAudit(prisma, {
            actorId: req.user!.id,
            entity: 'Service',
            entityId: service.id,
            action: 'CREATE',
            diff: {
                organizationId,
                serviceName,
                monthlyPriceCents: service.monthlyPriceCents,
                isActive,
            },
        });

        res.status(201).json(mapService(service));
    } catch (error) {
        console.error('Error creating service:', error);
        res.status(500).json({ error: 'Chyba při vytváření služby' });
    }
});

// PUT aktualizace služby
router.put('/:id', authMiddleware, authorize('billing:write'), async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const existing = await prisma.service.findUnique({
            where: { id: parseInt(id, 10) },
            include: { organization: true },
        });

        if (!existing) {
            return res.status(404).json({ error: 'Služba nenalezena' });
        }

        const updateData: any = {
            serviceName:
                req.body.serviceName !== undefined ? req.body.serviceName : existing.serviceName,
            description:
                req.body.description !== undefined ? req.body.description : existing.description,
            isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : existing.isActive,
        };

        if (req.body.monthlyPrice !== undefined) {
            updateData.monthlyPriceCents = toCents(req.body.monthlyPrice);
        }

        const service = await prisma.service.update({
            where: { id: parseInt(id, 10) },
            data: updateData,
            include: {
                organization: true,
            },
        });

        await logAudit(prisma, {
            actorId: req.user!.id,
            entity: 'Service',
            entityId: service.id,
            action: 'UPDATE',
            diff: updateData,
        });

        res.json(mapService(service));
    } catch (error) {
        console.error('Error updating service:', error);
        res.status(500).json({ error: 'Chyba při aktualizaci služby' });
    }
});

// DELETE smazání služby
router.delete('/:id', authMiddleware, authorize('billing:write'), async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const existing = await prisma.service.findUnique({
            where: { id: parseInt(id, 10) },
        });

        if (!existing) {
            return res.status(404).json({ error: 'Služba nenalezena' });
        }

        await prisma.service.delete({
            where: { id: parseInt(id, 10) },
        });

        await logAudit(prisma, {
            actorId: req.user!.id,
            entity: 'Service',
            entityId: parseInt(id, 10),
            action: 'DELETE',
            diff: {},
        });

        res.json({ message: 'Služba smazána' });
    } catch (error) {
        console.error('Error deleting service:', error);
        res.status(500).json({ error: 'Chyba při mazání služby' });
    }
});

// POST hromadné vytvoření služeb
router.post('/bulk', authMiddleware, authorize('billing:write'), async (req: AuthRequest, res: Response) => {
    try {
        const { organizationId, services } = req.body;

        if (!organizationId || !Array.isArray(services)) {
            return res.status(400).json({
                error: 'ID organizace a pole služeb jsou povinné',
            });
        }

        const organization = await prisma.organization.findUnique({
            where: { id: parseInt(organizationId, 10) },
        });

        if (!organization) {
            return res.status(404).json({ error: 'Organizace nenalezena' });
        }

        const createdServices = [];
        const errors = [];

        for (let i = 0; i < services.length; i += 1) {
            try {
                const service = services[i];

                if (!service.serviceName || service.monthlyPrice === undefined) {
                    errors.push({
                        index: i,
                        error: 'Název a cena služby jsou povinné',
                    });
                    continue;
                }

                const created = await prisma.service.create({
                    data: {
                        organizationId: parseInt(organizationId, 10),
                        serviceName: service.serviceName,
                        description: service.description || null,
                        monthlyPriceCents: toCents(service.monthlyPrice) ?? 0,
                        isActive: service.isActive !== undefined ? Boolean(service.isActive) : true,
                    },
                });

                const mapped = mapService(created);
                await logAudit(prisma, {
                    actorId: req.user!.id,
                    entity: 'Service',
                    entityId: created.id,
                    action: 'CREATE',
                    diff: mapped,
                });

                createdServices.push(mapped);
            } catch (error: any) {
                errors.push({
                    index: i,
                    error: error.message,
                });
            }
        }

        res.json({
            created: createdServices.length,
            total: services.length,
            errors,
            services: createdServices,
        });
    } catch (error) {
        console.error('Error bulk creating services:', error);
        res.status(500).json({ error: 'Chyba při hromadném vytváření služeb' });
    }
});

// GET služby organizace
router.get('/organization/:organizationId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const { organizationId } = req.params;
        const { isActive } = req.query;

        const where: any = {
            organizationId: parseInt(organizationId, 10),
        };

        if (isActive !== undefined) {
            where.isActive = isActive === 'true';
        }

        const services = await prisma.service.findMany({
            where,
            orderBy: {
                serviceName: 'asc',
            },
        });

        const mapped = services.map(mapService);
        const totalMonthlyPriceCents = mapped.reduce(
            (sum, service) => sum + service.monthlyPriceCents,
            0,
        );

        res.json({
            data: mapped,
            totalMonthlyPriceCents,
            totalMonthlyPrice: fromCents(totalMonthlyPriceCents),
        });
    } catch (error) {
        console.error('Error fetching organization services:', error);
        res.status(500).json({ error: 'Chyba při načítání služeb organizace' });
    }
});

export default router;
