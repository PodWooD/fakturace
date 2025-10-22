#!/usr/bin/env node

/*
 * Migrates legacy files stored under backend/uploads into MinIO (or the configured
 * object storage). Updates database locations so future downloads use the new
 * storage backend. Safe to run multiple times – entries already pointing to
 * s3:// or file:// outside legacy structure are skipped.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const path = require('path');
const { PrismaClient } = require('@prisma/client');
const storageService = require('../src/services/storageService');

const prisma = new PrismaClient();

const legacyUploadsPrefix = '/uploads/';

const EXT_CONTENT_TYPE = {
  '.pdf': 'application/pdf',
  '.xml': 'application/xml; charset=windows-1250',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.isdoc': 'application/xml',
};

function legacyLocationToFileScheme(location) {
  if (!location) return null;
  if (location.startsWith('s3://') || location.startsWith('file://')) {
    return location;
  }
  if (location.startsWith(legacyUploadsPrefix)) {
    return `file://${location.slice(legacyUploadsPrefix.length)}`;
  }
  return `file://${location.replace(/^\//, '')}`;
}

function extractPrefix(location) {
  const parsed = storageService.parseLocation(location);
  if (parsed.scheme === 's3') {
    const parts = parsed.objectName.split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') : 'misc';
  }
  if (parsed.scheme === 'file') {
    const parts = parsed.relativePath.split('/');
    return parts.length > 1 ? parts[0] : 'misc';
  }
  return 'misc';
}

function inferExtension(location, fallbackExt = '') {
  if (!location) return fallbackExt;
  const parsed = storageService.parseLocation(location);
  let raw = '';
  if (parsed.scheme === 's3') {
    raw = parsed.objectName;
  } else if (parsed.scheme === 'file') {
    raw = parsed.relativePath;
  } else {
    raw = location;
  }
  const ext = path.extname(raw);
  if (ext) return ext;
  return fallbackExt;
}

async function migrateLocation(currentLocation, { prefixFallback = 'misc', filenameFallback }) {
  if (!currentLocation) {
    return { skipped: true };
  }

  if (currentLocation.startsWith('s3://')) {
    return { skipped: true };
  }

  const normalized = legacyLocationToFileScheme(currentLocation);
  const parsed = storageService.parseLocation(normalized);

  const buffer = await storageService.getFileBuffer(normalized).catch((err) => {
    console.error(`  ! Failed to read ${currentLocation}: ${err.message}`);
    return null;
  });

  if (!buffer) {
    return { failed: true };
  }

  const ext = inferExtension(normalized, path.extname(filenameFallback || '') || '');
  const prefix = parsed.scheme === 'file' ? parsed.relativePath.split('/')[0] || prefixFallback : prefixFallback;
  const contentType = EXT_CONTENT_TYPE[ext.toLowerCase()] || 'application/octet-stream';

  const stored = await storageService.saveFile({
    buffer,
    prefix,
    extension: ext,
    contentType,
  });

  // Remove legacy copy (best effort)
  await storageService.removeFile(normalized).catch(() => {});

  return { location: stored.location };
}

async function migrateReceivedInvoices() {
  const rows = await prisma.receivedInvoice.findMany({
    select: { id: true, sourceFilePath: true, invoiceNumber: true },
    where: {
      sourceFilePath: { not: null },
    },
  });

  let migrated = 0;
  for (const row of rows) {
    if (!row.sourceFilePath || row.sourceFilePath.startsWith('s3://')) continue;
    const result = await migrateLocation(row.sourceFilePath, {
      prefixFallback: 'received',
      filenameFallback: `${row.invoiceNumber || row.id}.pdf`,
    });
    if (result.location) {
      await prisma.receivedInvoice.update({
        where: { id: row.id },
        data: {
          sourceFilePath: result.location,
        },
      });
      migrated += 1;
      console.log(` - ReceivedInvoice#${row.id} -> ${result.location}`);
    }
  }

  return migrated;
}

async function migrateInvoiceArtifacts(field, prefix, fallbackExt) {
  const rows = await prisma.invoice.findMany({
    select: { id: true, invoiceNumber: true, [field]: true },
    where: {
      [field]: { not: null },
    },
  });

  let migrated = 0;
  for (const row of rows) {
    const currentLocation = row[field];
    if (!currentLocation || currentLocation.startsWith('s3://')) continue;

    const result = await migrateLocation(currentLocation, {
      prefixFallback: prefix,
      filenameFallback: `${row.invoiceNumber || row.id}${fallbackExt}`,
    });

    if (result.location) {
      await prisma.invoice.update({
        where: { id: row.id },
        data: {
          [field]: result.location,
        },
      });
      migrated += 1;
      console.log(` - Invoice#${row.id} (${field}) -> ${result.location}`);
    }
  }

  return migrated;
}

async function main() {
  if (!storageService.isMinioConfigured) {
    console.log('MinIO/S3 is not configured – nothing to migrate.');
    return;
  }

  let total = 0;

  console.log('Migrating received invoice source files…');
  total += await migrateReceivedInvoices();

  console.log('Migrating invoice PDF artifacts…');
  total += await migrateInvoiceArtifacts('pdfUrl', 'exports/invoices', '.pdf');

  console.log('Migrating invoice Pohoda XML artifacts…');
  total += await migrateInvoiceArtifacts('pohodaXml', 'exports/pohoda', '.xml');

  console.log(`Migration complete. Updated ${total} records.`);
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
