const express = require('express');

const router = express.Router();
const { register, updateQueueMetrics } = require('../metrics');
const { getOcrQueueStats } = require('../queues/ocrQueue');
const { getPdfQueueStats } = require('../queues/pdfQueue');
const { getPohodaQueueStats } = require('../queues/pohodaQueue');
const { getNotificationQueueStats } = require('../queues/notificationQueue');
const { getIsdocQueueStats } = require('../queues/isdocQueue');

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

module.exports = router;
