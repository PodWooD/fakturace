import express from 'express';
import { register, updateQueueMetrics } from '../metrics';
// @ts-ignore
import { getOcrQueueStats } from '../queues/ocrQueue';
// @ts-ignore
import { getPdfQueueStats } from '../queues/pdfQueue';
// @ts-ignore
import { getPohodaQueueStats } from '../queues/pohodaQueue';
// @ts-ignore
import { getNotificationQueueStats } from '../queues/notificationQueue';
// @ts-ignore
import { getIsdocQueueStats } from '../queues/isdocQueue';

const router = express.Router();

router.get('/', async (req, res) => {
    await updateQueueMetrics([
        { name: 'ocr', getter: getOcrQueueStats },
        { name: 'pdf', getter: getPdfQueueStats },
        { name: 'pohoda', getter: getPohodaQueueStats },
        { name: 'isdoc', getter: getIsdocQueueStats },
        { name: 'notifications', getter: getNotificationQueueStats },
    ]);

    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
});

export default router;
