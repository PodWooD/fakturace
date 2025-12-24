import express, { Request, Response } from 'express';
import authMiddleware, { authorize } from '../middleware/auth';
// @ts-ignore
import { getOcrQueueStats } from '../queues/ocrQueue';
// @ts-ignore
import { getPdfQueueStats } from '../queues/pdfQueue';
// @ts-ignore
import { getPohodaQueueStats } from '../queues/pohodaQueue';
// @ts-ignore
import { getIsdocQueueStats } from '../queues/isdocQueue';
// @ts-ignore
import { getNotificationQueueStats } from '../queues/notificationQueue';

const router = express.Router();

router.get('/queues', authMiddleware, authorize('queues:read'), async (req: Request, res: Response) => {
    try {
        const [ocr, pdf, pohoda, isdoc, notifications] = await Promise.all([
            getOcrQueueStats(),
            getPdfQueueStats(),
            getPohodaQueueStats(),
            getIsdocQueueStats(),
            getNotificationQueueStats(),
        ]);

        res.json({
            queues: {
                ocr,
                pdf,
                pohoda,
                isdoc,
                notifications,
            },
        });
    } catch (error) {
        console.error('Error fetching queue stats:', error);
        res.status(500).json({ error: 'Nelze načíst stav front' });
    }
});

export default router;
