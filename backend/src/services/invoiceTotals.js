const DEFAULT_VAT_RATE = 0.21;

const roundCurrency = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const toNumber = (value, fallback = 0) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};

const calculateInvoiceTotals = (
  organization,
  workRecords = [],
  services = [],
  hardware = [],
  vatRate = DEFAULT_VAT_RATE
) => {
  const hourlyRate = toNumber(organization?.hourlyRate);
  const kmRate = toNumber(organization?.kmRate);

  const workAmountRaw = workRecords.reduce((sum, record) => {
    const minutes = toNumber(record?.minutes);
    return sum + (minutes / 60) * hourlyRate;
  }, 0);

  const kmAmountRaw = workRecords.reduce((sum, record) => {
    const kilometers = toNumber(record?.kilometers);
    return sum + kilometers * kmRate;
  }, 0);

  const servicesAmountRaw = services.reduce((sum, service) => {
    if (service?.isActive === false) {
      return sum;
    }
    return sum + toNumber(service?.monthlyPrice);
  }, 0);

  const hardwareAmountRaw = hardware.reduce((sum, item) => {
    if (item?.totalPrice !== undefined && item?.totalPrice !== null) {
      return sum + toNumber(item.totalPrice);
    }

    const quantity = toNumber(item?.quantity);
    const unitPrice = toNumber(item?.unitPrice);
    return sum + quantity * unitPrice;
  }, 0);

  const workAmount = roundCurrency(workAmountRaw);
  const kmAmount = roundCurrency(kmAmountRaw);
  const servicesAmount = roundCurrency(servicesAmountRaw);
  const hardwareAmount = roundCurrency(hardwareAmountRaw);
  const totalAmount = roundCurrency(
    workAmount + kmAmount + servicesAmount + hardwareAmount
  );
  const totalVat = roundCurrency(totalAmount * toNumber(vatRate, DEFAULT_VAT_RATE));
  const totalWithVat = roundCurrency(totalAmount + totalVat);

  return {
    workAmount,
    kmAmount,
    servicesAmount,
    hardwareAmount,
    totalAmount,
    totalVat,
    totalWithVat
  };
};

module.exports = {
  DEFAULT_VAT_RATE,
  roundCurrency,
  calculateInvoiceTotals
};
