import express, { Request, Response } from 'express';
import { PrismaClient, InvoiceStatus, RoundingMode } from '@prisma/client';
import authMiddleware, { authorize } from '../middleware/auth';
import PohodaExport from '../services/pohodaExport';
import storageService from '../services/storageService';
import { generateInvoicePdf, getPdfQueueStats } from '../queues/pdfQueue';
import { generatePohodaXml, getPohodaQueueStats } from '../queues/pohodaQueue';
import { generateIsdoc, getIsdocQueueStats } from '../queues/isdocQueue';

import { assertPeriodUnlocked } from '../utils/accounting';
import {
    collectInvoiceData,
    generateInvoiceNumber,
    getInvoiceWithData,
    mapInvoice,
    InvoiceDataPayload,
    FullInvoiceData
} from '../services/issuedInvoiceService';

const router = express.Router();
const prisma = new PrismaClient();
const pohodaExport = new PohodaExport();

interface AuthRequest extends Request {
    user?: {
        id: number;
        email: string;
        role: string;
        name: string;
    };
}

// GET faktury s filtrováním
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { month, year, organizationId, status, page = '1', limit = '20' } = req.query;

        const where: any = {};
        if (month) where.month = parseInt(String(month), 10);
        if (year) where.year = parseInt(String(year), 10);
        if (organizationId) where.organizationId = parseInt(String(organizationId), 10);
        if (status) where.status = status;

        const pageNum = parseInt(String(page), 10);
        const limitNum = parseInt(String(limit), 10);

        const total = await prisma.invoice.count({ where });

        const invoices = await prisma.invoice.findMany({
            where,
            include: {
                organization: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        ico: true,
                        dic: true,
                    },
                },
            },
            orderBy: [
                { year: 'desc' },
                { month: 'desc' },
                { invoiceNumber: 'desc' },
            ],
            skip: (pageNum - 1) * limitNum,
            take: limitNum,
        });

        res.json({
            data: invoices.map(mapInvoice),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error('Error fetching invoices:', error);
        res.status(500).json({ error: 'Chyba při načítání faktur' });
    }
});

// GET detail faktury
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const payload = await getInvoiceWithData(prisma, parseInt(req.params.id, 10));

        if (!payload) {
            return res.status(404).json({ error: 'Faktura nenalezena' });
        }

        res.json(payload);
    } catch (error) {
        console.error('Error fetching invoice:', error);
        res.status(500).json({ error: 'Chyba při načítání faktury' });
    }
});

// POST preview faktury (bez vytvoření)
router.post('/preview', authMiddleware, authorize('invoices:generate'), async (req: AuthRequest, res: Response) => {
    try {
        const { organizationId, month, year } = req.body;

        if (!organizationId || !month || !year) {
            return res.status(400).json({
                error: 'Organizace, měsíc a rok jsou povinné',
            });
        }

        const payload = await collectInvoiceData(
            prisma,
            parseInt(organizationId, 10),
            parseInt(month, 10),
            parseInt(year, 10),
            { includeWorkplace: true }
        );

        if (!payload) {
            return res.status(404).json({ error: 'Organizace nenalezena' });
        }

        res.json({
            organization: payload.organization,
            month: payload.month,
            year: payload.year,
            workRecords: payload.workRecords,
            services: payload.services,
            hardware: payload.hardware,
            totals: payload.totals,
        });
    } catch (error) {
        console.error('Error creating invoice preview:', error);
        res.status(500).json({ error: 'Chyba při vytváření náhledu faktury' });
    }
});

// POST generování faktury
router.post('/generate', authMiddleware, authorize('invoices:generate'), async (req: AuthRequest, res: Response) => {
    try {
        const { organizationId, month, year, roundingMode = RoundingMode.HALF_UP } = req.body;

        if (!organizationId || !month || !year) {
            return res.status(400).json({
                error: 'Organizace, měsíc a rok jsou povinné',
            });
        }

        const resolvedOrgId = parseInt(organizationId, 10);
        const resolvedMonth = parseInt(month, 10);
        const resolvedYear = parseInt(year, 10);

        await assertPeriodUnlocked(prisma, { month: resolvedMonth, year: resolvedYear });

        const existing = await prisma.invoice.findFirst({
            where: {
                organizationId: resolvedOrgId,
                month: resolvedMonth,
                year: resolvedYear,
            },
        });

        if (existing) {
            return res.status(400).json({
                error: 'Faktura pro tuto organizaci a období již existuje',
            });
        }

        const payload = await collectInvoiceData(prisma, resolvedOrgId, resolvedMonth, resolvedYear);

        if (!payload) {
            return res.status(404).json({ error: 'Organizace nenalezena' });
        }

        const { organization, workRecords, services, hardware, totals } = payload;
        const invoiceNumber = await generateInvoiceNumber(prisma, resolvedYear, resolvedMonth);

        const invoice = await prisma.invoice.create({
            data: {
                organizationId: resolvedOrgId,
                invoiceNumber,
                month: resolvedMonth,
                year: resolvedYear,
                totalAmountCents: totals.totalAmountCents,
                totalVatCents: totals.totalVatCents,
                roundingMode,
                status: InvoiceStatus.DRAFT,
                generatedAt: new Date(),
            },
            include: {
                organization: true,
            },
        });

        res.status(201).json({
            invoice: mapInvoice(invoice),
            breakdown: {
                workAmountCents: totals.workAmountCents,
                workAmount: totals.workAmount,
                kmAmountCents: totals.kmAmountCents,
                kmAmount: totals.kmAmount,
                servicesAmountCents: totals.servicesAmountCents,
                servicesAmount: totals.servicesAmount,
                hardwareAmountCents: totals.hardwareAmountCents,
                hardwareAmount: totals.hardwareAmount,
                workRecordsCount: workRecords.length,
                servicesCount: services.length,
                hardwareCount: hardware.length,
            },
            totals: {
                totalAmountCents: totals.totalAmountCents,
                totalAmount: totals.totalAmount,
                totalVatCents: totals.totalVatCents,
                totalVat: totals.totalVat,
                totalWithVatCents: totals.totalWithVatCents,
                totalWithVat: totals.totalWithVat,
            },
        });
    } catch (error: any) {
        if (error.code === 'PERIOD_LOCKED') {
            return res.status(423).json({ error: error.message });
        }
        console.error('Error generating invoice:', error);
        res.status(500).json({ error: 'Chyba při generování faktury' });
    }
});

// PUT aktualizace faktury
router.put('/:id', authMiddleware, authorize('invoices:generate'), async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { status, notes, totalAmount, totalAmountCents, totalVat, totalVatCents, roundingMode } =
            req.body;

        const existing = await prisma.invoice.findUnique({
            where: { id: parseInt(id, 10) },
        });

        if (!existing) {
            return res.status(404).json({ error: 'Faktura nenalezena' });
        }

        const updateData: any = {};
        if (status && (InvoiceStatus as any)[status]) updateData.status = status;
        if (notes !== undefined) updateData.notes = notes;
        if (roundingMode && (RoundingMode as any)[roundingMode]) {
            updateData.roundingMode = roundingMode;
        }

        if (totalAmountCents !== undefined) {
            updateData.totalAmountCents = parseInt(totalAmountCents, 10);
        } else if (totalAmount !== undefined) {
            updateData.totalAmountCents = Math.round(Number(totalAmount) * 100);
        }

        if (totalVatCents !== undefined) {
            updateData.totalVatCents = parseInt(totalVatCents, 10);
        } else if (totalVat !== undefined) {
            updateData.totalVatCents = Math.round(Number(totalVat) * 100);
        }

        const invoice = await prisma.invoice.update({
            where: { id: parseInt(id, 10) },
            data: updateData,
            include: {
                organization: true,
            },
        });

        res.json(mapInvoice(invoice));
    } catch (error) {
        console.error('Error updating invoice:', error);
        res.status(500).json({ error: 'Chyba při aktualizaci faktury' });
    }
});

// DELETE smazání faktury
router.delete('/:id', authMiddleware, authorize('invoices:delete'), async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const existing = await prisma.invoice.findUnique({
            where: { id: parseInt(id, 10) },
        });

        if (!existing) {
            return res.status(404).json({ error: 'Faktura nenalezena' });
        }

        if (existing.status === InvoiceStatus.SENT || existing.status === InvoiceStatus.PAID) {
            return res.status(400).json({
                error: 'Nelze smazat odeslanou nebo zaplacenou fakturu',
            });
        }

        await prisma.invoice.delete({
            where: { id: parseInt(id, 10) },
        });

        res.json({ message: 'Faktura smazána' });
    } catch (error) {
        console.error('Error deleting invoice:', error);
        res.status(500).json({ error: 'Chyba při mazání faktury' });
    }
});

// POST hromadné generování faktur
router.post('/generate-batch', authMiddleware, authorize('invoices:generate'), async (req: AuthRequest, res: Response) => {
    try {
        const { month, year } = req.body;

        if (!month || !year) {
            return res.status(400).json({ error: 'Měsíc a rok jsou povinné' });
        }

        const resolvedMonth = parseInt(month, 10);
        const resolvedYear = parseInt(year, 10);

        await assertPeriodUnlocked(prisma, { month: resolvedMonth, year: resolvedYear });

        const organizationsWithRecords = await prisma.workRecord.groupBy({
            by: ['billingOrgId'],
            where: {
                month: resolvedMonth,
                year: resolvedYear,
                billingOrgId: {
                    not: null,
                },
            },
            _count: {
                id: true,
            },
        });

        const results: any = {
            generated: [],
            skipped: [],
            errors: [],
        };

        for (const entry of organizationsWithRecords) {
            const orgId = entry.billingOrgId;
            if (orgId === null) continue;

            try {
                const existing = await prisma.invoice.findFirst({
                    where: {
                        organizationId: orgId,
                        month: resolvedMonth,
                        year: resolvedYear,
                    },
                });

                if (existing) {
                    results.skipped.push({
                        organizationId: orgId,
                        reason: 'Faktura již existuje',
                    });
                    continue;
                }

                const payload = await collectInvoiceData(prisma, orgId, resolvedMonth, resolvedYear);

                if (!payload) {
                    results.errors.push({
                        organizationId: orgId,
                        error: 'Organizace nenalezena',
                    });
                    continue;
                }

                const invoiceNumber = await generateInvoiceNumber(prisma, resolvedYear, resolvedMonth);
                const invoice = await prisma.invoice.create({
                    data: {
                        organizationId: orgId,
                        invoiceNumber,
                        month: resolvedMonth,
                        year: resolvedYear,
                        totalAmountCents: payload.totals.totalAmountCents,
                        totalVatCents: payload.totals.totalVatCents,
                        status: InvoiceStatus.DRAFT,
                        generatedAt: new Date(),
                    },
                });

                results.generated.push(mapInvoice(invoice));
            } catch (error: any) {
                results.errors.push({
                    organizationId: orgId,
                    error: error.message,
                });
            }
        }

        res.json({
            summary: {
                total: organizationsWithRecords.length,
                generated: results.generated.length,
                skipped: results.skipped.length,
                errors: results.errors.length,
            },
            results,
        });
    } catch (error: any) {
        if (error.code === 'PERIOD_LOCKED') {
            return res.status(423).json({ error: error.message });
        }
        console.error('Error batch generating invoices:', error);
        res.status(500).json({ error: 'Chyba při hromadném generování faktur' });
    }
});

// GET PDF faktury
router.get('/:id/pdf', authMiddleware, authorize('invoices:export'), async (req: AuthRequest, res: Response) => {
    try {
        const payload = await getInvoiceWithData(prisma, parseInt(req.params.id, 10));

        if (!payload) {
            return res.status(404).json({ error: 'Faktura nenalezena' });
        }

        const { invoice, organization, workRecords, services, hardware } = payload;

        let pdfLocation = invoice.pdfUrl || null;
        let buffer: Buffer | null = null;

        if (pdfLocation) {
            buffer = await storageService.getFileBuffer(pdfLocation).catch(() => null);
        }

        if (!buffer) {
            pdfLocation = await generateInvoicePdf({
                invoice,
                organization,
                workRecords,
                services,
                hardware,
            });
            if (pdfLocation) {
                buffer = await storageService.getFileBuffer(pdfLocation);

                await prisma.invoice.update({
                    where: { id: invoice.id },
                    data: { pdfUrl: pdfLocation },
                });
            }
        }

        if (!buffer) {
            return res.status(500).json({ error: 'Nepodařilo se vygenerovat PDF' });
        }

        const filename = `${invoice.invoiceNumber}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({ error: 'Chyba při generování PDF' });
    }
});

// GET Pohoda XML
router.get('/:id/pohoda-xml', authMiddleware, authorize('invoices:export'), async (req: AuthRequest, res: Response) => {
    try {
        const payload = await getInvoiceWithData(prisma, parseInt(req.params.id, 10));

        if (!payload) {
            return res.status(404).json({ error: 'Faktura nenalezena' });
        }

        const { invoice, organization, workRecords, services, hardware } = payload;

        let xmlLocation = invoice.pohodaXml || null;
        let buffer: Buffer | null = null;

        if (xmlLocation) {
            buffer = await storageService.getFileBuffer(xmlLocation).catch(() => null);
        }

        if (!buffer) {
            xmlLocation = await generatePohodaXml({
                invoice,
                organization,
                workRecords,
                services,
                hardware,
            });
            if (xmlLocation) {
                buffer = await storageService.getFileBuffer(xmlLocation);

                await prisma.invoice.update({
                    where: { id: invoice.id },
                    data: { pohodaXml: xmlLocation },
                });
            }
        }

        if (!buffer) {
            return res.status(500).json({ error: 'Nepodařilo se vygenerovat Pohoda XML' });
        }

        const filename = `${invoice.invoiceNumber}.xml`;
        res.setHeader('Content-Type', 'application/xml; charset=windows-1250');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error) {
        console.error('Error generating Pohoda XML:', error);
        res.status(500).json({ error: 'Chyba při generování Pohoda XML' });
    }
});

// GET ISDOC
router.get('/:id/isdoc', authMiddleware, authorize('invoices:export'), async (req: AuthRequest, res: Response) => {
    try {
        const payload = await getInvoiceWithData(prisma, parseInt(req.params.id, 10));

        if (!payload) {
            return res.status(404).json({ error: 'Faktura nenalezena' });
        }

        const { invoice, organization, workRecords, services, hardware, totals } = payload;

        let isdocLocation = invoice.isdocUrl || null;
        let buffer: Buffer | null = null;

        if (isdocLocation) {
            buffer = await storageService.getFileBuffer(isdocLocation).catch(() => null);
        }

        if (!buffer) {
            isdocLocation = await generateIsdoc({
                invoice,
                organization,
                workRecords,
                services,
                hardware,
                totals,
            });
            if (isdocLocation) {
                buffer = await storageService.getFileBuffer(isdocLocation);

                await prisma.invoice.update({
                    where: { id: invoice.id },
                    data: { isdocUrl: isdocLocation },
                });
            }
        }

        if (!buffer) {
            return res.status(500).json({ error: 'Nepodařilo se vygenerovat ISDOC' });
        }

        const filename = `${invoice.invoiceNumber}.isdoc`;
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error) {
        console.error('Error generating ISDOC:', error);
        res.status(500).json({ error: 'Chyba při generování ISDOC' });
    }
});

router.get('/:id/export', authMiddleware, authorize('invoices:export'), async (req: AuthRequest, res: Response) => {
    try {
        const payload = await getInvoiceWithData(prisma, parseInt(req.params.id, 10));

        if (!payload) {
            return res.status(404).json({ error: 'Faktura nenalezena' });
        }

        const { invoice, organization, workRecords, services, hardware } = payload;
        let xmlLocation = invoice.pohodaXml || null;
        let buffer: Buffer | null = null;

        if (xmlLocation) {
            buffer = await storageService.getFileBuffer(xmlLocation).catch(() => null);
        }

        if (!buffer) {
            // @ts-ignore
            const stored = await pohodaExport.savePohodaXML(
                invoice,
                workRecords,
                services,
                hardware,
                organization,
            );
            xmlLocation = stored.location;
            buffer = await storageService.getFileBuffer(xmlLocation);

            await prisma.invoice.update({
                where: { id: invoice.id },
                data: { pohodaXml: xmlLocation },
            });
        }

        if (!buffer) {
            return res.status(500).json({ error: 'Nepodařilo se exportovat fakturu' });
        }

        const filename = `${invoice.invoiceNumber}.xml`;
        res.setHeader('Content-Type', 'application/xml; charset=windows-1250');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error) {
        console.error('Error exporting invoice XML:', error);
        res.status(500).json({ error: 'Chyba při exportu faktury' });
    }
});

router.post('/export-batch', authMiddleware, authorize('invoices:export'), async (req: AuthRequest, res: Response) => {
    try {
        const { invoiceIds } = req.body;

        if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
            return res.status(400).json({ error: 'Seznam faktur je povinný' });
        }

        const missing: number[] = [];
        const payloads: FullInvoiceData[] = [];

        for (const rawId of invoiceIds) {
            const invoiceId = parseInt(rawId, 10);

            if (Number.isNaN(invoiceId)) {
                return res.status(400).json({ error: 'Neplatné ID faktury', invalidId: rawId });
            }

            const payload = await getInvoiceWithData(prisma, invoiceId);

            if (!payload) {
                missing.push(invoiceId);
            } else {
                payloads.push(payload);
            }
        }

        if (missing.length > 0) {
            return res.status(404).json({ error: 'Některé faktury nebyly nalezeny', missing });
        }

        if (payloads.length === 0) {
            return res.status(404).json({ error: 'Žádné faktury k exportu' });
        }

        // @ts-ignore
        const xmlData = pohodaExport.generateBatchXML(payloads);
        const now = new Date();
        const filename = `pohoda-export-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.xml`;

        res.setHeader('Content-Type', 'application/xml; charset=windows-1250');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(xmlData);
    } catch (error) {
        console.error('Error exporting invoices batch:', error);
        res.status(500).json({ error: 'Chyba při exportu faktur' });
    }
});

// GET statistiky faktur
router.get('/stats/:year', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { year } = req.params;

        const stats = await prisma.invoice.groupBy({
            by: ['month', 'status'],
            where: {
                year: parseInt(year, 10),
            },
            _sum: {
                totalAmountCents: true,
                totalVatCents: true,
            },
            _count: {
                id: true,
            },
        });

        const monthlyStats: any = {};

        for (let monthIdx = 1; monthIdx <= 12; monthIdx += 1) {
            monthlyStats[monthIdx] = {
                totalCents: 0,
                total: 0,
                byStatus: {
                    DRAFT: { count: 0, amountCents: 0, amount: 0 },
                    SENT: { count: 0, amountCents: 0, amount: 0 },
                    PAID: { count: 0, amountCents: 0, amount: 0 },
                    CANCELLED: { count: 0, amountCents: 0, amount: 0 },
                },
            };
        }

        stats.forEach((item) => {
            const month = item.month;
            const status = item.status;
            const count = item._count.id;
            const amountCents = item._sum.totalAmountCents || 0;

            if (!monthlyStats[month]) return;

            monthlyStats[month].byStatus[status] = {
                count,
                amountCents,
                amount: amountCents / 100, // Approximate for stats, or use fromCents if strictly needed but float is fine for summary charts
            };

            monthlyStats[month].totalCents += amountCents;
            monthlyStats[month].total = monthlyStats[month].totalCents / 100;
        });

        res.json(monthlyStats);
    } catch (error) {
        console.error('Error fetching invoice stats:', error);
        res.status(500).json({ error: 'Chyba při načítání statistik' });
    }
});

export default router;
