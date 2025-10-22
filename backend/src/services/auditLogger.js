const logAudit = async (prisma, { actorId, entity, entityId, action, diff }) => {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        entity,
        entityId,
        action,
        diffJson: diff || {},
      },
    });
  } catch (error) {
    // Audit nesmí blokovat hlavní tok
    console.error('Audit log error:', error.message);
  }
};

module.exports = {
  logAudit,
};
