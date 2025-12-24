import { PrismaClient, Prisma } from '@prisma/client';

export const logAudit = async (
    prisma: PrismaClient,
    { actorId, entity, entityId, action, diff }: {
        actorId?: number | null;
        entity: string;
        entityId: number;
        action: string;
        diff?: Prisma.InputJsonValue;
    }
): Promise<void> => {
    try {
        await prisma.auditLog.create({
            data: {
                actorId: actorId || null,
                entity,
                entityId,
                action,
                diffJson: diff || Prisma.JsonNull,
            },
        });
    } catch (error: any) {
        // Audit nesmí blokovat hlavní tok
        console.error('Audit log error:', error.message);
    }
};
