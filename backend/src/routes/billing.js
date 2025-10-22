const express = require('express');

const router = express.Router();
const { PrismaClient, RoundingMode } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { authorize } = authMiddleware;
const { getBillingSummary } = require('../services/billingSummary');
const { assertPeriodUnlocked } = require('../utils/accounting');
const { logAudit } = require('../services/auditLogger');

const prisma = new PrismaClient();

const parsePeriodParams = (req) => {
  const month = req.query.month || new Date().getMonth() + 1;
  const year = req.query.year || new Date().getFullYear();

  return {
    month: parseInt(month, 10),
    year: parseInt(year, 10)
  };
};

router.get('/summary', authMiddleware, authorize('billing:read'), async (req, res) => {
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

    res.json({
      base,
      draft: draft
        ? {
            data: draft.data,
            roundingMode: draft.roundingMode,
            updatedAt: draft.updatedAt,
            updatedBy: draft.updatedBy,
          }
        : null
    });
  } catch (error) {
    console.error('Billing summary error:', error);
    res.status(500).json({ error: 'Chyba při načítání dat fakturace' });
  }
});

router.put('/draft', authMiddleware, authorize('billing:write'), async (req, res) => {
  try {
    const { organizationId, month, year, data, roundingMode } = req.body;

    if (!organizationId || !month || !year || data === undefined) {
      return res.status(400).json({ error: 'organizationId, month, year a data jsou povinné' });
    }

    const resolvedOrgId = parseInt(organizationId, 10);
    const resolvedMonth = parseInt(month, 10);
    const resolvedYear = parseInt(year, 10);

    await assertPeriodUnlocked(prisma, { month: resolvedMonth, year: resolvedYear });

    const draftData = {
      data: data ?? {},
      updatedBy: req.user?.id || null,
    };

    if (roundingMode && RoundingMode[roundingMode]) {
      draftData.roundingMode = roundingMode;
    }

    const upserted = await prisma.billingDraft.upsert({
      where: {
        organizationId_month_year: {
          organizationId: resolvedOrgId,
          month: resolvedMonth,
          year: resolvedYear
        }
      },
      update: {
        ...draftData
      },
      create: {
        organizationId: resolvedOrgId,
        month: resolvedMonth,
        year: resolvedYear,
        ...draftData
      }
    });

    res.json({
      data: upserted.data,
      roundingMode: upserted.roundingMode,
      updatedAt: upserted.updatedAt,
      updatedBy: upserted.updatedBy
    });

    await logAudit(prisma, {
      actorId: req.user?.id,
      entity: 'BillingDraft',
      entityId: upserted.id,
      action: 'UPSERT',
      diff: {
        organizationId: resolvedOrgId,
        month: resolvedMonth,
        year: resolvedYear,
        roundingMode: upserted.roundingMode,
      },
    });
  } catch (error) {
    if (error.code === 'PERIOD_LOCKED') {
      return res.status(423).json({ error: error.message });
    }
    console.error('Billing draft error:', error);
    res.status(500).json({ error: 'Chyba při ukládání návrhu fakturace' });
  }
});

module.exports = router;
