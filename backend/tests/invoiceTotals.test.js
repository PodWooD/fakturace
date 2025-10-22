const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateInvoiceTotals,
  roundCurrency
} = require('../src/services/invoiceTotals');

test('calculateInvoiceTotals sums work, km, services and hardware correctly', () => {
  const organization = {
    hourlyRateCents: 60000,
    kilometerRateCents: 1000
  };

  const workRecords = [
    { minutes: 120, kilometers: 15 },
    { minutes: 90, kilometers: 5 }
  ];

  const services = [
    { monthlyPriceCents: 500000, isActive: true },
    { monthlyPriceCents: 200000, isActive: false }
  ];

  const hardware = [
    { totalPriceCents: 300000 },
    { quantity: 2, unitPriceCents: 150000 }
  ];

  const result = calculateInvoiceTotals(organization, workRecords, services, hardware);

  assert.equal(result.workAmount, 2100);
  assert.equal(result.kmAmount, 200);
  assert.equal(result.servicesAmount, 5000);
  assert.equal(result.hardwareAmount, 6000);
  assert.equal(result.totalAmount, 13300);
  assert.equal(result.totalVat, roundCurrency(13300 * 0.21));
  assert.equal(result.totalWithVat, result.totalAmount + result.totalVat);
});

test('calculateInvoiceTotals tolerates missing values and rounds currency', () => {
  const organization = {
    hourlyRateCents: 55050,
    kilometerRateCents: 950
  };

  const workRecords = [
    { minutes: 75.5, kilometers: '12.3' },
    { minutes: undefined, kilometers: null }
  ];

  const services = [
    { monthlyPriceCents: 123457 }
  ];

  const hardware = [
    { quantity: 3, unitPriceCents: 9999 }
  ];

  const result = calculateInvoiceTotals(organization, workRecords, services, hardware);

  // Manuální výpočet (cents → CZK)
  const expectedWork = roundCurrency((75.5 / 60) * (55050 / 100));
  const expectedKm = roundCurrency(12.3 * (950 / 100));
  const expectedServices = roundCurrency(123457 / 100);
  const expectedHardware = roundCurrency(3 * (9999 / 100));
  const expectedTotal = roundCurrency(
    expectedWork + expectedKm + expectedServices + expectedHardware
  );
  const expectedVat = roundCurrency(expectedTotal * 0.21);
  const expectedWithVat = roundCurrency(expectedTotal + expectedVat);

  assert.equal(result.workAmount, expectedWork);
  assert.equal(result.kmAmount, expectedKm);
  assert.equal(result.servicesAmount, expectedServices);
  assert.equal(result.hardwareAmount, expectedHardware);
  assert.equal(result.totalAmount, expectedTotal);
  assert.equal(result.totalVat, expectedVat);
  assert.equal(result.totalWithVat, expectedWithVat);
});
