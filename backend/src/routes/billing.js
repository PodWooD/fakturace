const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { getBillingSummary } = require('../services/billingSummary');

const prisma = new PrismaClient();
const router = express.Router();

const parsePeriodParams = (req) => {
  const month = req.query.month || new Date().getMonth() + 1;
  const year = req.query.year || new Date().getFullYear();

  return {
    month: parseInt(month, 10),
    year: parseInt(year, 10)
  };
};

router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const { organizationId } = req.query;
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId je povinný parametr' });
    }

    const { month, year } = parsePeriodParams(req);

    const base = await getBillingSummary(prisma, organizationId, month, year);

    if (!base) {
      return res.status(404).json({ error: 'Organizace nenalezena' });
    }

    const draft = await prisma.billingDraft.findUnique({
      where: {
        organizationId_month_year: {
          organizationId: base.organization.id,
          month,
          year
        }
      }
    });

    let parsedDraft = null;
    if (draft) {
      let payload = null;
      try {
        payload = JSON.parse(draft.data);
      } catch (error) {
        payload = null;
      }

      parsedDraft = {
        data: payload,
        updatedAt: draft.updatedAt,
        updatedBy: draft.updatedBy
      };
    }

    res.json({
      base,
      draft: parsedDraft
    });
  } catch (error) {
    console.error('Billing summary error:', error);
    res.status(500).json({ error: 'Chyba při načítání dat fakturace' });
  }
});

router.put('/draft', authMiddleware, async (req, res) => {
  try {
    const { organizationId, month, year, data } = req.body;

    if (!organizationId || !month || !year || data === undefined) {
      return res.status(400).json({ error: 'organizationId, month, year a data jsou povinné' });
    }

    const resolvedOrgId = parseInt(organizationId, 10);
    const resolvedMonth = parseInt(month, 10);
    const resolvedYear = parseInt(year, 10);

    const storedData = JSON.stringify(data ?? {});

    const upserted = await prisma.billingDraft.upsert({
      where: {
        organizationId_month_year: {
          organizationId: resolvedOrgId,
          month: resolvedMonth,
          year: resolvedYear
        }
      },
      update: {
        data: storedData,
        updatedBy: req.user?.id || null
      },
      create: {
        organizationId: resolvedOrgId,
        month: resolvedMonth,
        year: resolvedYear,
        data: storedData,
        updatedBy: req.user?.id || null
      }
    });

    let parsed = null;
    try {
      parsed = JSON.parse(upserted.data);
    } catch (error) {
      parsed = null;
    }

    res.json({
      data: parsed,
      updatedAt: upserted.updatedAt,
      updatedBy: upserted.updatedBy
    });
  } catch (error) {
    console.error('Billing draft error:', error);
    res.status(500).json({ error: 'Chyba při ukládání návrhu fakturace' });
  }
});

module.exports = router;
