const assertPeriodUnlocked = async (prisma, { year, month }) => {
  if (!year || !month) {
    return;
  }

  const period = await prisma.accountingPeriod.findFirst({
    where: {
      year,
      month,
      lockedAt: {
        not: null,
      },
    },
  });

  if (period) {
    const monthLabel = `${month.toString().padStart(2, '0')}/${year}`;
    const lockTimestamp = period.lockedAt.toISOString();
    const error = new Error(`Uzavřené účetní období ${monthLabel} (uzamčeno ${lockTimestamp})`);
    error.code = 'PERIOD_LOCKED';
    throw error;
  }
};

module.exports = {
  assertPeriodUnlocked,
};
