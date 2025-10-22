const {
  HardwareStatus,
  ReceivedInvoiceItemStatus,
} = require('@prisma/client');
const { normalizeNumber } = require('../utils/money');
const { assertPeriodUnlocked } = require('../utils/accounting');

class AssignmentError extends Error {
  constructor(message, statusCode = 400, code = 'ASSIGNMENT_ERROR') {
    super(message);
    this.name = 'AssignmentError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const parseIntOrNull = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

async function assignInvoiceItem({
  prisma,
  itemId,
  organizationId,
  month,
  year,
  status,
}) {
  const parsedOrganizationId = parseIntOrNull(organizationId);
  const parsedMonth = parseIntOrNull(month);
  const parsedYear = parseIntOrNull(year);

  if (!parsedOrganizationId || !parsedMonth || !parsedYear) {
    throw new AssignmentError(
      'organizationId, month a year jsou povinné parametry',
      400,
      'MISSING_FIELDS',
    );
  }

  await assertPeriodUnlocked(prisma, {
    month: parsedMonth,
    year: parsedYear,
  });

  const item = await prisma.receivedInvoiceItem.findUnique({
    where: { id: itemId },
    include: { hardware: true },
  });

  if (!item) {
    throw new AssignmentError('Položka nenalezena', 404, 'ITEM_NOT_FOUND');
  }

  if (item.hardware) {
    throw new AssignmentError('Položka už byla přiřazena', 400, 'ALREADY_ASSIGNED');
  }

  const quantity = normalizeNumber(item.quantity ? item.quantity.toString() : null) || 1;
  const roundedQuantity = Math.max(Math.round(quantity), 1);
  const unitPriceCents =
    item.unitPriceCents ||
    Math.round((item.totalPriceCents || 0) / (quantity || 1)) ||
    0;
  const totalPriceCents = item.totalPriceCents || unitPriceCents * roundedQuantity;

  const hardware = await prisma.hardware.create({
    data: {
      organizationId: parsedOrganizationId,
      itemName: item.itemName,
      description: item.description,
      quantity: roundedQuantity,
      unitPriceCents,
      totalPriceCents,
      vatRate: item.vatRate || 0,
      month: parsedMonth,
      year: parsedYear,
      status: status && HardwareStatus[status] ? status : HardwareStatus.ASSIGNED,
      assignedAt: new Date(),
      sourceInvoiceItemId: item.id,
    },
  });

  const updatedItem = await prisma.receivedInvoiceItem.update({
    where: { id: itemId },
    data: {
      status: ReceivedInvoiceItemStatus.ASSIGNED,
      assignedOrganizationId: parsedOrganizationId,
      assignedMonth: parsedMonth,
      assignedYear: parsedYear,
    },
  });

  return {
    hardware,
    updatedItem,
    originalItem: item,
  };
}

module.exports = {
  assignInvoiceItem,
  AssignmentError,
};
