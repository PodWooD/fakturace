const { NotificationLevel, NotificationType } = require('@prisma/client');

const DEFAULT_LIMIT = 50;

const coerceArray = (value) => {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
};

const createNotification = async (prisma, { type, level = NotificationLevel.INFO, message, metadata, userId }) => {
  if (!Object.values(NotificationType).includes(type)) {
    throw new Error(`Unsupported notification type: ${type}`);
  }

  return prisma.notification.create({
    data: {
      type,
      level,
      message,
      metadata: metadata ?? {},
      userId: userId ?? null,
    },
  });
};

const markNotificationRead = async (prisma, { id, userId }) => {
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

const markAllNotificationsRead = async (prisma, { userId }) => {
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

const getNotifications = async (prisma, { userId, unreadOnly = false, types, limit, includeRead = true }) => {
  const typeFilter = coerceArray(types);
  const where = {
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

module.exports = {
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  getNotifications,
};
