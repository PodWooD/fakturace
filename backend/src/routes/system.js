const express = require('express');

const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { authorize } = authMiddleware;
const { getOcrQueueStats } = require('../queues/ocrQueue');
const { getPdfQueueStats } = require('../queues/pdfQueue');
const { getPohodaQueueStats } = require('../queues/pohodaQueue');
const { getIsdocQueueStats } = require('../queues/isdocQueue');
const { getNotificationQueueStats } = require('../queues/notificationQueue');

router.get('/queues', authMiddleware, authorize('queues:read'), async (req, res) => {
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

module.exports = router;
