const express = require('express');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { parseInvoice } = require('../services/ocrService');

const prisma = new PrismaClient();
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

const conditionalUpload = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    return upload.single('file')(req, res, next);
  }
  next();
};

const parseNumeric = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  if (Number.isFinite(num)) return num;
  return fallback;
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);

router.post('/upload', authMiddleware, conditionalUpload, async (req, res) => {
  try {
    let payload = null;

    if (req.body && req.body.json) {
      payload = JSON.parse(req.body.json);
    } else if (req.body && req.is('application/json')) {
      payload = req.body;
    } else if (req.file) {
      payload = await parseInvoice({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimetype: req.file.mimetype
      });
    }

    if (!payload || !payload.items || !payload.items.length) {
      return res.status(400).json({ error: 'Nepodařilo se načíst data z faktury' });
    }

    const now = new Date();
    const invoiceData = {
      supplierName: payload.supplierName || 'Neznámý dodavatel',
      supplierIco: payload.supplierIco || null,
      invoiceNumber: payload.invoiceNumber || `TEMP-${now.getTime()}`,
      issueDate: payload.issueDate ? new Date(payload.issueDate) : null,
      totalWithoutVat: payload.totalWithoutVat !== undefined ? String(payload.totalWithoutVat) : null,
      totalWithVat: payload.totalWithVat !== undefined ? String(payload.totalWithVat) : null,
      currency: payload.currency || 'CZK',
      status: 'PENDING',
      sourceFilePath: null,
      ocrPayload: JSON.stringify(payload),
      createdBy: req.user?.id || null
    };

    const invoice = await prisma.receivedInvoice.create({
      data: invoiceData
    });

    const items = ensureArray(payload.items).map((item) => ({
      invoiceId: invoice.id,
      itemName: item.itemName || 'Neuvedená položka',
      description: item.description || null,
      quantity: item.quantity !== undefined ? String(item.quantity) : null,
      unitPrice: item.unitPrice !== undefined ? String(item.unitPrice) : null,
      totalPrice: item.totalPrice !== undefined ? String(item.totalPrice) : null,
      vatRate: item.vatRate !== undefined ? String(item.vatRate) : null,
      status: 'PENDING'
    }));

    if (items.length) {
      await prisma.receivedInvoiceItem.createMany({ data: items });
    }

    const createdItems = await prisma.receivedInvoiceItem.findMany({
      where: { invoiceId: invoice.id }
    });

    res.status(201).json({
      invoice,
      items: createdItems
    });
  } catch (error) {
    console.error('Error uploading invoice:', error);
    res.status(500).json({ error: 'Chyba při nahrávání faktury' });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) {
      where.status = status;
    }

    const invoices = await prisma.receivedInvoice.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Chyba při načítání faktur' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const invoice = await prisma.receivedInvoice.findUnique({
      where: { id: parseInt(req.params.id, 10) },
      include: {
        items: {
          orderBy: { id: 'asc' }
        }
      }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Faktura nenalezena' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice detail:', error);
    res.status(500).json({ error: 'Chyba při načítání detailu faktury' });
  }
});

router.put('/:id/items', authMiddleware, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Chybí pole položek' });
    }

    const updates = items.map((item) =>
      prisma.receivedInvoiceItem.update({
        where: { id: item.id },
        data: {
          itemName: item.itemName,
          description: item.description,
          quantity: item.quantity !== undefined ? String(item.quantity) : null,
          unitPrice: item.unitPrice !== undefined ? String(item.unitPrice) : null,
          totalPrice: item.totalPrice !== undefined ? String(item.totalPrice) : null,
          vatRate: item.vatRate !== undefined ? String(item.vatRate) : null,
          status: item.status || 'PENDING'
        }
      })
    );

    await prisma.$transaction(updates);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating invoice items:', error);
    res.status(500).json({ error: 'Chyba při ukládání položek' });
  }
});

router.post('/:id/approve', authMiddleware, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const invoice = await prisma.receivedInvoice.findUnique({
      where: { id: invoiceId }
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Faktura nenalezena' });
    }

    await prisma.receivedInvoice.update({
      where: { id: invoiceId },
      data: { status: 'READY' }
    });

    await prisma.receivedInvoiceItem.updateMany({
      where: { invoiceId },
      data: { status: 'APPROVED' }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error approving invoice:', error);
    res.status(500).json({ error: 'Chyba při schvalování faktury' });
  }
});

router.post('/:id/reject', authMiddleware, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    await prisma.receivedInvoice.update({
      where: { id: invoiceId },
      data: { status: 'ARCHIVED' }
    });

    await prisma.receivedInvoiceItem.updateMany({
      where: { invoiceId },
      data: { status: 'REJECTED' }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error rejecting invoice:', error);
    res.status(500).json({ error: 'Chyba při archivaci faktury' });
  }
});

router.get('/items/list', authMiddleware, async (req, res) => {
  try {
    const { status, organizationId, invoiceId } = req.query;
    const where = {};
    if (status) {
      where.status = status;
    }
    if (organizationId) {
      where.assignedOrganizationId = parseInt(organizationId, 10);
    }
    if (invoiceId) {
      where.invoiceId = parseInt(invoiceId, 10);
    }

    const items = await prisma.receivedInvoiceItem.findMany({
      where,
      include: {
        invoice: true,
        assignedOrganization: true,
        hardware: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(items);
  } catch (error) {
    console.error('Error fetching invoice items:', error);
    res.status(500).json({ error: 'Chyba při načítání položek' });
  }
});

router.post('/items/:id/assign', authMiddleware, async (req, res) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    const { organizationId, month, year } = req.body;

    if (!organizationId || !month || !year) {
      return res.status(400).json({ error: 'organizationId, month a year jsou povinné parametry' });
    }

    const item = await prisma.receivedInvoiceItem.findUnique({
      where: { id: itemId },
      include: { invoice: true, hardware: true }
    });

    if (!item) {
      return res.status(404).json({ error: 'Položka nenalezena' });
    }

    if (item.hardware) {
      return res.status(400).json({ error: 'Položka už byla přiřazena' });
    }

    const quantityNumeric = parseNumeric(item.quantity, 1) || 1;
    const unitPriceNumeric = parseNumeric(item.unitPrice, parseNumeric(item.totalPrice, 0));
    const totalPriceNumeric = parseNumeric(item.totalPrice, quantityNumeric * unitPriceNumeric);

    const hardware = await prisma.hardware.create({
      data: {
        organizationId: parseInt(organizationId, 10),
        itemName: item.itemName,
        description: item.description,
        quantity: Math.round(quantityNumeric),
        unitPrice: String(unitPriceNumeric),
        totalPrice: String(totalPriceNumeric),
        month: parseInt(month, 10),
        year: parseInt(year, 10),
        status: 'ASSIGNED',
        assignedAt: new Date(),
        sourceInvoiceItemId: item.id
      }
    });

    await prisma.receivedInvoiceItem.update({
      where: { id: itemId },
      data: {
        status: 'ASSIGNED',
        assignedOrganizationId: parseInt(organizationId, 10),
        assignedMonth: parseInt(month, 10),
        assignedYear: parseInt(year, 10)
      }
    });

    res.json({ hardware });
  } catch (error) {
    console.error('Error assigning invoice item:', error);
    res.status(500).json({ error: 'Chyba při přiřazení položky' });
  }
});

module.exports = router;
