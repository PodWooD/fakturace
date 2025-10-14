-- CreateTable ReceivedInvoice
DROP TABLE IF EXISTS "ReceivedInvoiceItem";
DROP TABLE IF EXISTS "ReceivedInvoice";

CREATE TABLE "ReceivedInvoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "supplierName" TEXT NOT NULL,
    "supplierIco" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "issueDate" DATETIME,
    "totalWithoutVat" DECIMAL,
    "totalWithVat" DECIMAL,
    "currency" TEXT NOT NULL DEFAULT 'CZK',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sourceFilePath" TEXT,
    "ocrPayload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" INTEGER
);

-- CreateTable ReceivedInvoiceItem
CREATE TABLE "ReceivedInvoiceItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL,
    "unitPrice" DECIMAL,
    "totalPrice" DECIMAL,
    "vatRate" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "assignedOrganizationId" INTEGER,
    "assignedMonth" INTEGER,
    "assignedYear" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReceivedInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ReceivedInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReceivedInvoiceItem_assignedOrganizationId_fkey" FOREIGN KEY ("assignedOrganizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Rebuild Hardware table to add nové sloupce a cizí klíč
CREATE TABLE "new_Hardware" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "organizationId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "totalPrice" DECIMAL NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "sourceInvoiceItemId" INTEGER,
    "assignedAt" DATETIME,
    CONSTRAINT "new_Hardware_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "new_Hardware_sourceInvoiceItemId_fkey" FOREIGN KEY ("sourceInvoiceItemId") REFERENCES "ReceivedInvoiceItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Hardware" ("id", "organizationId", "itemName", "description", "quantity", "unitPrice", "totalPrice", "month", "year", "status", "sourceInvoiceItemId", "assignedAt")
SELECT "id", "organizationId", "itemName", "description", "quantity", "unitPrice", "totalPrice", "month", "year", 'NEW', NULL, NULL
FROM "Hardware";

DROP TABLE "Hardware";

ALTER TABLE "new_Hardware" RENAME TO "Hardware";

-- Add relations between Hardware and ReceivedInvoiceItem
CREATE UNIQUE INDEX "Hardware_sourceInvoiceItemId_key" ON "Hardware"("sourceInvoiceItemId");
