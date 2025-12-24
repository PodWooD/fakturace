import { PrismaClient } from '@prisma/client';

export const assertPeriodUnlocked = async (
    prisma: PrismaClient,
    { year, month }: { year?: number; month?: number }
): Promise<void> => {
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

    if (period && period.lockedAt) {
        const monthLabel = `${month.toString().padStart(2, '0')}/${year}`;
        const lockTimestamp = period.lockedAt.toISOString();
        const error = new Error(`Uzavřené účetní období ${monthLabel} (uzamčeno ${lockTimestamp})`) as Error & { code: string };
        error.code = 'PERIOD_LOCKED';
        throw error;
    }
};
