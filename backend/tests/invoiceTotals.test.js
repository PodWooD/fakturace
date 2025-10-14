const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateInvoiceTotals,
  roundCurrency
} = require('../src/services/invoiceTotals');

test('calculateInvoiceTotals sums work, km, services and hardware correctly', () => {
  const organization = {
    hourlyRate: 600,
    kmRate: 10
  };

  const workRecords = [
    { minutes: 120, kilometers: 15 },
    { minutes: 90, kilometers: 5 }
  ];

  const services = [
    { monthlyPrice: 5000, isActive: true },
    { monthlyPrice: 2000, isActive: false }
  ];

  const hardware = [
    { totalPrice: 3000 },
    { quantity: 2, unitPrice: 1500 }
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
    hourlyRate: '550.5',
    kmRate: '9.5'
  };

  const workRecords = [
    { minutes: 75.5, kilometers: '12.3' },
    { minutes: undefined, kilometers: null }
  ];

  const services = [
    { monthlyPrice: '1234.567' }
  ];

  const hardware = [
    { quantity: 3, unitPrice: '99.99' }
  ];

  const result = calculateInvoiceTotals(organization, workRecords, services, hardware);

  // Manuální výpočet
  const expectedWork = roundCurrency((75.5 / 60) * 550.5);
  const expectedKm = roundCurrency(12.3 * 9.5);
  const expectedServices = roundCurrency(1234.567);
  const expectedHardware = roundCurrency(3 * 99.99);
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
