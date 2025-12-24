import express, { Request, Response } from 'express';
import multer from 'multer';
import {
    PrismaClient,
    ReceivedInvoiceStatus,
    ReceivedInvoiceItemStatus,
    NotificationType,
    NotificationLevel,
    Prisma,
    ReceivedInvoice,
} from '@prisma/client';
import authMiddleware, { authorize } from '../middleware/auth';
import { parseInvoice } from '../services/ocrService';
import { toCents, normalizeNumber } from '../utils/money';
import { logAudit } from '../services/auditLogger';
import storageService from '../services/storageService';
import { processOcrJob } from '../queues/ocrQueue';
import { enqueueNotification } from '../queues/notificationQueue';
import { parseIsdoc } from '../services/isdocParser';
import { assignInvoiceItem, AssignmentError } from '../services/hardwareAssignment';
import {
    mapInvoice,
    buildInvoiceData,
    buildInvoiceItems,
    ensureDigestUnique,
    serializeQuantity,
} from '../services/invoiceService';

const router = express.Router();
const prisma = new PrismaClient();
const OCR_MAX_ATTEMPTS = parseInt(process.env.OCR_MAX_ATTEMPTS || '3', 10);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
});

// Types for request
interface AuthRequest extends Request {
    user?: {
        id: number;
        email: string;
        role: string;
        name: string;
    };
    file?: Express.Multer.File;
}

const isIsdocFile = (filename = '') => {
    return filename.toLowerCase().endsWith('.isdoc') || filename.toLowerCase().endsWith('.isdocx');
};

const parseIsdocBuffer = async ({ buffer, filename }: { buffer: Buffer; filename: string }) => {
    try {
        const parsed = await parseIsdoc(buffer);
        return parsed;
    } catch (error: any) {
        throw new Error(`ISDOC parser selhal pro soubor ${filename}: ${error.message}`);
    }
};

const queueNotification = async (payload: any, context: any) => {
    try {
        await enqueueNotification(payload, prisma);
    } catch (error: any) {
        console.error(`[Notification] Failed to enqueue ${payload?.type || 'notification'}`, {
            error: error.message,
            context,
        });
    }
};

const extractPayload = async (req: AuthRequest) => {
    if (req.body && req.body.json) {
        return JSON.parse(req.body.json);
    }

    if (req.is('application/json')) {
        return req.body;
    }

    if (req.file) {
        return parseInvoice({
            buffer: req.file.buffer,
            filename: req.file.originalname,
            mimetype: req.file.mimetype,
        });
    }

    return null;
};

// Upload nebo import přijaté faktury
router.post(
    '/upload',
    authMiddleware,
    authorize('receivedInvoices:ocr'),
    upload.single('file'),
    async (req: AuthRequest, res: Response) => {
        let storedFilePath: string | null = null;
        let newlyStoredLocation: string | null = null;
        let isdocFile = false;
        try {
            if (req.file) {
                const originalExt = (req.file.originalname || '').split('.').pop();
                const stored = await storageService.saveFile({
                    buffer: req.file.buffer,
                    prefix: 'received',
                    extension: originalExt ? `.${originalExt}` : '',
                    contentType: req.file.mimetype,
                });
                storedFilePath = stored.location;
                newlyStoredLocation = stored.location;
            }

            let payload;

            if (req.file) {
                isdocFile = isIsdocFile(req.file.originalname || '');
                try {
                    if (isdocFile) {
                        payload = await parseIsdocBuffer({ buffer: req.file.buffer, filename: req.file.originalname });
                    } else {
                        payload = await processOcrJob({
                            sourceLocation: storedFilePath,
                            filename: req.file.originalname || 'invoice.pdf',
                            mimetype: req.file.mimetype,
                        });
                    }
                } catch (error: any) {
                    if (isdocFile) {
                        await queueNotification(
                            {
                                type: NotificationType.OCR_FAILURE,
                                level: NotificationLevel.ERROR,
                                message: `ISDOC zpracování selhalo pro soubor ${req.file.originalname || 'neznámý soubor'}`,
                                metadata: {
                                    sourceLocation: storedFilePath,
                                    filename: req.file.originalname || null,
                                    error: error.message,
                                    attempts: 1,
                                    route: 'upload-isdoc',
                                },
                                userId: req.user?.id ?? null,
                            },
                            { route: 'upload', stage: 'isdoc-failure' },
                        );
                    } else {
                        await queueNotification(
                            {
                                type: NotificationType.OCR_FAILURE,
                                level: NotificationLevel.ERROR,
                                message: `OCR selhalo pro soubor ${req.file.originalname || 'neznámý soubor'}`,
                                metadata: {
                                    sourceLocation: storedFilePath,
                                    filename: req.file.originalname || null,
                                    error: error.message,
                                    attempts: OCR_MAX_ATTEMPTS,
                                    route: 'upload',
                                },
                                userId: req.user?.id ?? null,
                            },
                            { route: 'upload', stage: 'ocr-failure' },
                        );
                    }
                    return res.status(502).json({
                        error: 'OCR selhalo',
                        detail: error.message,
                    });
                }
            } else {
                payload = await extractPayload(req);
            }

            if (!isdocFile && payload?.__mock) {
                await queueNotification(
                    {
                        type: NotificationType.OCR_FAILURE,
                        level: NotificationLevel.ERROR,
                        message: `OCR selhalo pro soubor ${req.file?.originalname || 'neznámý soubor'}`,
                        metadata: {
                            sourceLocation: storedFilePath,
                            filename: req.file?.originalname || null,
                            error: payload.errorMessage || 'Služba OCR nevrátila žádná data',
                            attempts: OCR_MAX_ATTEMPTS,
                            route: 'upload-mock',
                        },
                        userId: req.user?.id ?? null,
                    },
                    { route: 'upload', stage: 'mock' },
                );
                return res.status(502).json({
                    error: 'OCR selhalo',
                    detail: payload.errorMessage || 'Služba OCR nevrátila žádná data',
                });
            }

            if (!payload || !payload.items || payload.items.length === 0) {
                await queueNotification(
                    {
                        type: NotificationType.OCR_FAILURE,
                        level: NotificationLevel.ERROR,
                        message: `${isdocFile ? 'ISDOC' : 'OCR'} nevrátilo žádné položky pro soubor ${req.file?.originalname || 'neznámý soubor'}`,
                        metadata: {
                            sourceLocation: storedFilePath,
                            filename: req.file?.originalname || null,
                            error: isdocFile ? 'ISDOC neobsahuje položky' : 'OCR nevrátilo žádné položky',
                            attempts: isdocFile ? 1 : OCR_MAX_ATTEMPTS,
                            route: isdocFile ? 'upload-isdoc-empty' : 'upload-empty',
                        },
                        userId: req.user?.id ?? null,
                    },
                    { route: 'upload', stage: isdocFile ? 'isdoc-empty' : 'empty' },
                );
                return res.status(400).json({ error: 'Nepodařilo se načíst data z faktury' });
            }

            const invoiceData = buildInvoiceData(payload, req.user?.id);
            invoiceData.ocrStatus = 'SUCCESS';
            invoiceData.ocrError = null;
            if (!storedFilePath && payload.sourceFilePath) {
                storedFilePath = payload.sourceFilePath;
            }
            if (storedFilePath) {
                invoiceData.sourceFilePath = storedFilePath;
            }

            const existing = await ensureDigestUnique(prisma, invoiceData.digest);
            if (existing) {
                if (newlyStoredLocation) {
                    await storageService.removeFile(newlyStoredLocation);
                }
                return res.status(200).json({
                    duplicated: true,
                    invoice: mapInvoice(existing),
                });
            }

            const invoice = await prisma.receivedInvoice.create({
                data: {
                    ...invoiceData,
                    sourceFilePath: storedFilePath,
                    items: {
                        create: buildInvoiceItems(payload.items) as Prisma.ReceivedInvoiceItemCreateWithoutInvoiceInput[],
                    },
                },
                include: {
                    items: true,
                },
            });

            await logAudit(prisma, {
                actorId: req.user?.id,
                entity: 'ReceivedInvoice',
                entityId: invoice.id,
                action: 'CREATE',
                diff: invoice,
            });

            res.status(201).json({
                duplicated: false,
                invoice: mapInvoice(invoice),
            });
        } catch (error: any) {
            await queueNotification(
                {
                    type: NotificationType.OCR_FAILURE,
                    level: NotificationLevel.ERROR,
                    message: `Nahrávání faktury selhalo pro soubor ${req.file?.originalname || 'neznámý soubor'}`,
                    metadata: {
                        sourceLocation: storedFilePath ?? newlyStoredLocation ?? null,
                        filename: req.file?.originalname || null,
                        error: error.message,
                        route: 'upload-exception',
                    },
                    userId: req.user?.id ?? null,
                },
                { route: 'upload', stage: 'exception' },
            );
            console.error('Error uploading invoice:', error);
            res.status(500).json({ error: 'Chyba při nahrávání faktury' });
        }
    },
);

// List faktur
router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const { status, supplier, invoiceNumber } = req.query;
        const where: any = {};

        if (status) {
            where.status = status;
        }

        if (supplier) {
            where.supplierName = { contains: String(supplier), mode: 'insensitive' };
        }

        if (invoiceNumber) {
            where.invoiceNumber = { contains: String(invoiceNumber), mode: 'insensitive' };
        }

        const invoices = await prisma.receivedInvoice.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });

        res.json(invoices.map(mapInvoice));
    } catch (error) {
        console.error('Error fetching invoices:', error);
        res.status(500).json({ error: 'Chyba při načítání faktur' });
    }
});

const resolveFilenameFromLocation = (location: string, fallback: string) => {
    if (!location) {
        return fallback;
    }
    const parsed = storageService.parseLocation(location);
    if (parsed.scheme === 's3') {
        const parts = parsed.objectName.split('/');
        return parts[parts.length - 1] || fallback;
    }
    if (parsed.scheme === 'file') {
        const parts = parsed.relativePath.split('/');
        return parts[parts.length - 1] || fallback;
    }
    return fallback;
};

// Stažení originálního souboru
router.get('/:id/file', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const invoiceId = parseInt(req.params.id, 10);
        const invoice = await prisma.receivedInvoice.findUnique({
            where: { id: invoiceId },
            select: {
                sourceFilePath: true,
                invoiceNumber: true,
            },
        });

        if (!invoice) {
            return res.status(404).json({ error: 'Faktura nenalezena' });
        }

        if (!invoice.sourceFilePath) {
            return res.status(404).json({ error: 'Pro tuto fakturu není uložen soubor' });
        }

        const buffer = await storageService.getFileBuffer(invoice.sourceFilePath).catch((error: any) => {
            console.error('Error fetching invoice file:', error);
            return null;
        });

        if (!buffer) {
            return res.status(500).json({ error: 'Nepodařilo se stáhnout soubor faktury' });
        }

        const filename = resolveFilenameFromLocation(
            invoice.sourceFilePath,
            `${invoice.invoiceNumber || `received-invoice-${invoiceId}`}.pdf`,
        );

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error) {
        console.error('Error downloading invoice file:', error);
        res.status(500).json({ error: 'Chyba při stahování souboru' });
    }
});

// Detail faktury
router.get('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const invoice = await prisma.receivedInvoice.findUnique({
            where: { id: parseInt(req.params.id, 10) },
            include: {
                items: {
                    orderBy: { id: 'asc' },
                },
            },
        });

        if (!invoice) {
            return res.status(404).json({ error: 'Faktura nenalezena' });
        }

        res.json(mapInvoice(invoice));
    } catch (error) {
        console.error('Error fetching invoice detail:', error);
        res.status(500).json({ error: 'Chyba při načítání detailu faktury' });
    }
});

// Aktualizace položek faktury
router.put('/:id/items', authMiddleware, authorize('receivedInvoices:approve'), async (req: AuthRequest, res: Response) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'Chybí pole položek' });
        }

        const updates = items.map((item: any) =>
            prisma.receivedInvoiceItem.update({
                where: { id: item.id },
                data: {
                    itemName: item.itemName,
                    description: item.description || null,
                    productCode: item.productCode || null,
                    referenceProductCode: item.referenceProductCode || null,
                    quantity: serializeQuantity(item.quantity) || '1',
                    unitPriceCents: toCents(item.unitPrice ?? item.unitPriceCents) || 0,
                    totalPriceCents:
                        toCents(item.totalPrice ?? item.totalPriceCents) ||
                        (toCents(item.unitPrice ?? item.unitPriceCents) || 0) *
                        (normalizeNumber(item.quantity) || 1),
                    vatRate: item.vatRate !== undefined ? parseInt(item.vatRate, 10) : 0,
                    status: item.status && (ReceivedInvoiceItemStatus as any)[item.status]
                        ? item.status
                        : ReceivedInvoiceItemStatus.PENDING,
                },
            }),
        );

        await prisma.$transaction(updates);

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating invoice items:', error);
        res.status(500).json({ error: 'Chyba při ukládání položek' });
    }
});

// Znovu vytěžení faktury přes OCR
router.post('/:id/reprocess', authMiddleware, authorize('receivedInvoices:ocr'), async (req: AuthRequest, res: Response) => {
    const invoiceId = parseInt(req.params.id, 10);
    let invoice: (ReceivedInvoice & { items: any[] }) | null = null;
    try {
        invoice = await prisma.receivedInvoice.findUnique({
            where: { id: invoiceId },
            include: {
                items: {
                    include: {
                        hardware: true,
                    },
                },
            },
        });

        if (!invoice) {
            return res.status(404).json({ error: 'Faktura nenalezena' });
        }

        if (!invoice.sourceFilePath) {
            return res.status(400).json({ error: 'Pro tuto fakturu není dostupný originální soubor' });
        }

        const hasAssignedHardware = invoice.items.some((item) => item.hardware !== null);
        if (hasAssignedHardware) {
            return res.status(409).json({
                error: 'Nelze znovu vytěžit fakturu, některé položky jsou již přiřazeny k hardware',
            });
        }

        await prisma.receivedInvoice.update({
            where: { id: invoiceId },
            data: {
                ocrStatus: 'PROCESSING',
                ocrError: null,
            },
        }).catch((error) => {
            console.error('Failed to update invoice status to PROCESSING:', error);
        });

        let parsed;
        try {
            parsed = await processOcrJob({
                sourceLocation: invoice.sourceFilePath,
                filename: `${invoice.invoiceNumber || `invoice-${invoiceId}`}.pdf`,
                mimetype: 'application/pdf',
            });
        } catch (error: any) {
            await prisma.receivedInvoice.update({
                where: { id: invoiceId },
                data: {
                    ocrStatus: 'FAILED',
                    ocrError: error.message,
                },
            }).catch((updateError) => {
                console.error('Failed to update invoice status to FAILED:', updateError);
            });

            await queueNotification(
                {
                    type: NotificationType.OCR_FAILURE,
                    level: NotificationLevel.ERROR,
                    message: `OCR selhalo při opětovném zpracování faktury ${invoice.invoiceNumber || invoiceId}`,
                    metadata: {
                        invoiceId,
                        sourceLocation: invoice.sourceFilePath,
                        error: error.message,
                        attempts: OCR_MAX_ATTEMPTS,
                        route: 'reprocess',
                    },
                    userId: req.user?.id ?? null,
                },
                { route: 'reprocess', stage: 'ocr-failure' },
            );

            return res.status(502).json({
                error: 'OCR selhalo',
                detail: error.message,
            });
        }

        if (!parsed || !parsed.items || parsed.items.length === 0) {
            return res.status(400).json({ error: 'OCR nevrátilo žádná data' });
        }

        const invoiceData = buildInvoiceData(parsed, invoice.createdBy ?? undefined);
        invoiceData.ocrStatus = 'SUCCESS';
        invoiceData.ocrError = null;
        const duplicate = await ensureDigestUnique(prisma, invoiceData.digest);
        if (duplicate && duplicate.id !== invoice.id) {
            return res.status(409).json({ error: 'Faktura s těmito údaji již existuje' });
        }

        const itemsPayload = buildInvoiceItems(parsed.items);

        const updatedInvoice = await prisma.$transaction(async (tx) => {
            await tx.receivedInvoiceItem.deleteMany({ where: { invoiceId } });

            await tx.receivedInvoice.update({
                where: { id: invoiceId },
                data: {
                    ...invoiceData,
                    sourceFilePath: invoice!.sourceFilePath,
                },
            });

            if (itemsPayload.length) {
                await tx.receivedInvoiceItem.createMany({
                    data: itemsPayload.map((item) => ({
                        ...item,
                        invoiceId,
                    })),
                });
            }

            return tx.receivedInvoice.findUnique({
                where: { id: invoiceId },
                include: {
                    items: {
                        orderBy: { id: 'asc' },
                    },
                },
            });
        });

        if (!updatedInvoice) {
            return res.status(500).json({ error: 'Reprocesování faktury selhalo' });
        }

        await logAudit(prisma, {
            actorId: req.user?.id,
            entity: 'ReceivedInvoice',
            entityId: invoice.id,
            action: 'REPROCESS',
            diff: {
                previousItems: invoice.items.length,
                newItems: itemsPayload.length,
            },
        });

        res.json({ invoice: mapInvoice(updatedInvoice) });
    } catch (error: any) {
        if (invoiceId && invoice?.id) {
            await prisma.receivedInvoice.update({
                where: { id: invoiceId },
                data: {
                    ocrStatus: 'FAILED',
                    ocrError: error.message,
                },
            }).catch((updateError) => {
                console.error('Failed to flag invoice as FAILED after unexpected error:', updateError);
            });

            await queueNotification(
                {
                    type: NotificationType.OCR_FAILURE,
                    level: NotificationLevel.ERROR,
                    message: `OCR selhalo při opětovném zpracování faktury ${invoice.invoiceNumber || invoiceId}`,
                    metadata: {
                        invoiceId,
                        sourceLocation: invoice?.sourceFilePath ?? null,
                        error: error.message,
                        attempts: OCR_MAX_ATTEMPTS,
                        route: 'reprocess',
                    },
                    userId: req.user?.id ?? null,
                },
                { route: 'reprocess', stage: 'exception' },
            );
        }

        if (error.message === 'INVALID_FILE_PATH') {
            return res.status(500).json({ error: 'Neplatná cesta k souboru faktury' });
        }
        console.error('Error reprocessing invoice:', error);
        res.status(500).json({ error: 'Chyba při opětovném vytěžení faktury' });
    }
});

// Schválení faktury
router.post('/:id/approve', authMiddleware, authorize('receivedInvoices:approve'), async (req: AuthRequest, res: Response) => {
    try {
        const invoiceId = parseInt(req.params.id, 10);

        const invoice = await prisma.receivedInvoice.update({
            where: { id: invoiceId },
            data: { status: ReceivedInvoiceStatus.READY },
        });

        await prisma.receivedInvoiceItem.updateMany({
            where: { invoiceId },
            data: { status: ReceivedInvoiceItemStatus.APPROVED },
        });

        await logAudit(prisma, {
            actorId: req.user?.id,
            entity: 'ReceivedInvoice',
            entityId: invoice.id,
            action: 'APPROVE',
            diff: { status: ReceivedInvoiceStatus.READY },
        });

        res.json(mapInvoice(invoice));
    } catch (error) {
        console.error('Error approving invoice:', error);
        res.status(500).json({ error: 'Chyba při schvalování faktury' });
    }
});

export default router;
