import express, { Request, Response } from 'express';
import { PrismaClient, WorkRecordStatus, Prisma, UserRole, User, Organization, WorkRecord } from '@prisma/client';
import authMiddleware, { authorize } from '../middleware/auth';
import { fromCents, normalizeNumber } from '../utils/money';
import { assertPeriodUnlocked } from '../utils/accounting';
import { logAudit } from '../services/auditLogger';

const router = express.Router();
const prisma = new PrismaClient();

interface AuthRequest extends Request {
    user?: {
        id: number;
        email: string;
        role: string;
        name: string;
    };
}

const isTechnician = (user?: AuthRequest['user']) => user?.role === UserRole.TECHNICIAN;

const resolveTechnicianName = (user?: AuthRequest['user']): string => {
    if (!user) {
        return 'Technik';
    }
    if (user.name && user.name.trim()) {
        return user.name.trim();
    }
    if (user.email) {
        return user.email.trim();
    }
    return 'Technik';
};

const ensureTechnicianOwnership = (user: AuthRequest['user'], record: WorkRecord) => {
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
        // @ts-ignore
        error.code = 'TECHNICIAN_FORBIDDEN';
        throw error;
    }
};

const mapOrganization = (organization: Organization | null) => {
    if (!organization) {
        return null;
    }

    return {
        ...organization,
        hourlyRate: fromCents(organization.hourlyRateCents),
        kilometerRate: fromCents(organization.kilometerRateCents),
    };
};

const enrichRecord = (record: WorkRecord & { organization?: Organization | null; billingOrg?: Organization | null }) => {
    const organization = record.organization ? mapOrganization(record.organization) : null;
    const billingOrg = record.billingOrg ? mapOrganization(record.billingOrg) : null;
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

const toInt = (value: unknown): number => {
    const numeric = normalizeNumber(value);
    return numeric === null ? 0 : Math.round(numeric);
};

const parseMinutes = ({ minutes, hours, timeFrom, timeTo }: any): number => {
    if (minutes !== undefined && minutes !== null && minutes !== '') {
        return toInt(minutes);
    }

    if (hours !== undefined && hours !== null && hours !== '') {
        if (typeof hours === 'string' && hours.includes(':')) {
            const parts = hours.split(':').map((piece: string) => parseInt(piece, 10));
            if (parts.length === 2) {
                const [h, m] = parts;
                if (Number.isFinite(h) && Number.isFinite(m)) {
                    return h * 60 + m;
                }
            }
        }
        const numeric = normalizeNumber(hours);
        if (numeric !== null) {
            return Math.round(numeric * 60);
        }
    }

    if (timeFrom && timeTo) {
        const fromParts = timeFrom.split(':').map((n: string) => parseInt(n, 10));
        const toParts = timeTo.split(':').map((n: string) => parseInt(n, 10));

        if (fromParts.length === 2 && toParts.length === 2) {
            const [fromHours, fromMinutes] = fromParts;
            const [toHours, toMinutes] = toParts;

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
    }

    return 0;
};

const resolveDate = (value: any): Date => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        const error = new Error('Neplatné datum');
        // @ts-ignore
        error.code = 'INVALID_DATE';
        throw error;
    }
    return date;
};

const ensureOrganizationExists = async (organizationId: number) => {
    const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, isActive: true },
    });

    if (!organization) {
        const error = new Error('Organizace nenalezena');
        // @ts-ignore
        error.code = 'ORGANIZATION_NOT_FOUND';
        throw error;
    }

    if (!organization.isActive) {
        const error = new Error('Organizace je deaktivována');
        // @ts-ignore
        error.code = 'ORGANIZATION_INACTIVE';
        throw error;
    }

    return organization;
};

const fetchRecordWithRelations = async (id: number) =>
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
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const {
            month,
            year,
            organizationId,
            worker,
            status,
            page = '1',
            limit = '50',
        } = req.query;

        const where: any = {};
        const andConditions: any[] = [];

        const monthNumber = parseInt(String(month), 10);
        if (!Number.isNaN(monthNumber)) {
            where.month = monthNumber;
        }

        const yearNumber = parseInt(String(year), 10);
        if (!Number.isNaN(yearNumber)) {
            where.year = yearNumber;
        }

        const organizationNumber = parseInt(String(organizationId), 10);
        if (!Number.isNaN(organizationNumber)) {
            where.organizationId = organizationNumber;
        }

        if (status) {
            where.status = status;
        }

        if (worker) {
            andConditions.push({ worker: { contains: String(worker), mode: 'insensitive' } });
        }

        if (isTechnician(req.user)) {
            const technicianName = resolveTechnicianName(req.user);
            const technicianFilters: any[] = [];
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

        const pageNum = parseInt(String(page), 10);
        const limitNum = parseInt(String(limit), 10);

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
            skip: (pageNum - 1) * limitNum,
            take: limitNum,
        });

        res.json({
            data: records.map(enrichRecord),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error('Error fetching work records:', error);
        res.status(500).json({ error: 'Chyba při načítání pracovních záznamů' });
    }
});

// POST hromadné vytvoření záznamů (musí být před /:id)
router.post('/bulk', authMiddleware, authorize('workRecords:write'), async (req: AuthRequest, res: Response) => {
    try {
        const { records } = req.body;

        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ error: 'Pole záznamů je povinné' });
        }

        const created: any[] = [];
        const errors: any[] = [];

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
                        status: payload.status && (WorkRecordStatus as any)[payload.status]
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
                    actorId: req.user!.id,
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
            } catch (error: any) {
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
router.get('/summary/:year/:month', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (isTechnician(req.user)) {
            return res.status(403).json({ error: 'Nedostatečná oprávnění' });
        }
        const { year, month } = req.params;
        const { groupBy = 'billing' } = req.query;

        const groupByField = groupBy === 'workplace' ? 'organizationId' : 'billingOrgId';

        // Type casting because groupByField is dynamic
        const summary = await prisma.workRecord.groupBy({
            by: [groupByField as 'organizationId' | 'billingOrgId'],
            where: {
                month: parseInt(month, 10),
                year: parseInt(year, 10),
                // Adding not null check implicitly by query logic in DB usually, but for type safety:
                [groupByField]: { not: null }
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
            .map((item) => (item as any)[groupByField])
            .filter((id) => id !== null) as number[];

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
        }, {} as Record<number, any>);

        const result = summary
            .map((item) => {
                const orgId = (item as any)[groupByField];
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
router.get('/available-months', authMiddleware, async (req: AuthRequest, res: Response) => {
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
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
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

const buildWorkRecordPayload = async (payload: any, authorId?: number) => {
    const organizationId = parseInt(payload.organizationId, 10);
    if (!organizationId) {
        const error = new Error('Organizace je povinná');
        // @ts-ignore
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
            payload.status && (WorkRecordStatus as any)[payload.status]
                ? payload.status
                : WorkRecordStatus.DRAFT,
        userId: authorId || null,
        createdBy: authorId || null,
    };
};

// POST vytvoření záznamu
router.post('/', authMiddleware, authorize('workRecords:write'), async (req: AuthRequest, res: Response) => {
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
            actorId: req.user!.id,
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
    } catch (error: any) {
        if (error.code === 'PERIOD_LOCKED') {
            return res.status(423).json({ error: error.message });
        }
        console.error('Error creating work record:', error);
        res.status(500).json({ error: 'Chyba při vytváření záznamu' });
    }
});

// PUT aktualizace záznamu
router.put('/:id', authMiddleware, authorize('workRecords:write'), async (req: AuthRequest, res: Response) => {
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
            actorId: req.user!.id,
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
    } catch (error: any) {
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
router.post('/:id/status', authMiddleware, authorize('workRecords:write'), async (req: AuthRequest, res: Response) => {
    try {
        const { status } = req.body;
        const { id } = req.params;

        if (!status || !(WorkRecordStatus as any)[status]) {
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
            actorId: req.user!.id,
            entity: 'WorkRecord',
            entityId: record.id,
            action: 'STATUS_CHANGE',
            diff: {
                status: enriched.status,
            },
        });

        res.json(enriched);
    } catch (error: any) {
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
router.delete('/:id', authMiddleware, authorize('workRecords:write'), async (req: AuthRequest, res: Response) => {
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
            actorId: req.user!.id,
            entity: 'WorkRecord',
            entityId: parseInt(id, 10),
            action: 'DELETE',
            diff: {},
        });

        res.json({ message: 'Záznam smazán' });
    } catch (error: any) {
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

export default router;
