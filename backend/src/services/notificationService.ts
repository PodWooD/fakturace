import { PrismaClient, NotificationLevel, NotificationType, Prisma } from '@prisma/client';

const DEFAULT_LIMIT = 50;

const coerceArray = <T>(value: T | T[] | undefined): T[] | undefined => {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (Array.isArray(value)) {
        return value;
    }
    return [value];
};

interface CreateNotificationParams {
    type: NotificationType;
    level?: NotificationLevel;
    message: string;
    metadata?: Prisma.InputJsonValue;
    userId?: number | null;
}

export const createNotification = async (
    prisma: PrismaClient,
    { type, level = NotificationLevel.INFO, message, metadata, userId }: CreateNotificationParams
) => {
    if (!Object.values(NotificationType).includes(type)) {
        throw new Error(`Unsupported notification type: ${type}`);
    }

    return prisma.notification.create({
        data: {
            type,
            level,
            message,
            metadata: metadata ?? Prisma.JsonNull,
            userId: userId ?? null,
        },
    });
};

interface MarkReadParams {
    id: number;
    userId?: number;
}

export const markNotificationRead = async (
    prisma: PrismaClient,
    { id, userId }: MarkReadParams
) => {
    return prisma.notification.updateMany({
        where: {
            id,
            OR: [
                { userId: userId ?? null },
                { userId: null },
            ],
        },
        data: {
            readAt: new Date(),
        },
    });
};

export const markAllNotificationsRead = async (
    prisma: PrismaClient,
    { userId }: { userId?: number }
) => {
    return prisma.notification.updateMany({
        where: {
            readAt: null,
            OR: [
                { userId: userId ?? null },
                { userId: null },
            ],
        },
        data: {
            readAt: new Date(),
        },
    });
};

interface GetNotificationsParams {
    userId?: number;
    unreadOnly?: boolean;
    types?: NotificationType | NotificationType[];
    limit?: number;
    includeRead?: boolean;
}

export const getNotifications = async (
    prisma: PrismaClient,
    { userId, unreadOnly = false, types, limit, includeRead = true }: GetNotificationsParams
) => {
    const typeFilter = coerceArray(types);
    const where: Prisma.NotificationWhereInput = {
        OR: [
            { userId: userId ?? null },
            { userId: null },
        ],
    };

    if (unreadOnly && !includeRead) {
        where.readAt = null;
    } else if (unreadOnly) {
        where.readAt = null;
    }

    if (typeFilter && typeFilter.length) {
        where.type = { in: typeFilter };
    }

    return prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit ?? DEFAULT_LIMIT,
    });
};
