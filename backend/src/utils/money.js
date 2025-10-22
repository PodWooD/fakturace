const normalizeNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toCents = (value) => {
  const numeric = normalizeNumber(value);
  if (numeric === null) {
    return null;
  }
  return Math.round(numeric * 100);
};

const fromCents = (value, digits = 2) => {
  if (value === null || value === undefined) {
    return null;
  }
  return Number((value / 100).toFixed(digits));
};

module.exports = {
  normalizeNumber,
  toCents,
  fromCents,
};
