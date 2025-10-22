const { fromCents } = require('../utils/money');

const DEFAULT_VAT_RATE = 0.21;

const roundCurrency = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const toInt = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const calculateInvoiceTotals = (
  organization = {},
  workRecords = [],
  services = [],
  hardware = [],
  vatRate = DEFAULT_VAT_RATE,
) => {
  const hourlyRateCents = organization.hourlyRateCents || 0;
  const kilometerRateCents = organization.kilometerRateCents || 0;

  const workAmountCents = workRecords.reduce((sum, record) => {
    const minutes = toInt(record?.minutes);
    const hours = minutes / 60;
    return sum + Math.round(hours * hourlyRateCents);
  }, 0);

  const kmAmountCents = workRecords.reduce((sum, record) => {
    const kilometers = toInt(record?.kilometers);
    return sum + kilometers * kilometerRateCents;
  }, 0);

  const servicesAmountCents = services.reduce((sum, service) => {
    if (service?.isActive === false) {
      return sum;
    }
    return sum + (service?.monthlyPriceCents || 0);
  }, 0);

  const hardwareAmountCents = hardware.reduce((sum, item) => {
    if (item?.totalPriceCents) {
      return sum + item.totalPriceCents;
    }

    const quantity = toInt(item?.quantity) || 1;
    const unitPriceCents = item?.unitPriceCents || 0;
    return sum + unitPriceCents * quantity;
  }, 0);

  const totalAmountCents =
    workAmountCents + kmAmountCents + servicesAmountCents + hardwareAmountCents;

  const effectiveVatRate = Number.isFinite(Number(vatRate))
    ? Number(vatRate)
    : DEFAULT_VAT_RATE;

  const totalVatCents = Math.round(totalAmountCents * effectiveVatRate);
  const totalWithVatCents = totalAmountCents + totalVatCents;

  return {
    workAmountCents,
    workAmount: fromCents(workAmountCents),
    kmAmountCents,
    kmAmount: fromCents(kmAmountCents),
    servicesAmountCents,
    servicesAmount: fromCents(servicesAmountCents),
    hardwareAmountCents,
    hardwareAmount: fromCents(hardwareAmountCents),
    totalAmountCents,
    totalAmount: fromCents(totalAmountCents),
    totalVatCents,
    totalVat: fromCents(totalVatCents),
    totalWithVatCents,
    totalWithVat: fromCents(totalWithVatCents),
  };
};

module.exports = {
  DEFAULT_VAT_RATE,
  roundCurrency,
  calculateInvoiceTotals,
};
