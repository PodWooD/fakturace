-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ACCOUNTANT', 'TECHNICIAN', 'VIEWER');

-- CreateEnum
CREATE TYPE "WorkRecordStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReceivedInvoiceStatus" AS ENUM ('PENDING', 'READY', 'PROCESSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReceivedInvoiceItemStatus" AS ENUM ('PENDING', 'APPROVED', 'ASSIGNED', 'REJECTED');

-- CreateEnum
CREATE TYPE "HardwareStatus" AS ENUM ('NEW', 'ASSIGNED', 'INVOICED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('CZK', 'EUR', 'USD');

-- CreateEnum
CREATE TYPE "RoundingMode" AS ENUM ('HALF_UP', 'BANKERS');

-- CreateTable
CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "contactPerson" TEXT,
    "address" TEXT,
    "ico" TEXT,
    "dic" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "hourlyRateCents" INTEGER NOT NULL DEFAULT 0,
    "kilometerRateCents" INTEGER NOT NULL DEFAULT 0,
    "hardwareMarginPct" INTEGER NOT NULL DEFAULT 0,
    "softwareMarginPct" INTEGER NOT NULL DEFAULT 0,
    "outsourcingFeeCents" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" INTEGER,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "serviceName" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPriceCents" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkRecord" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "billingOrgId" INTEGER,
    "userId" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "worker" TEXT,
    "description" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "timeFrom" TEXT,
    "timeTo" TEXT,
    "branch" TEXT,
    "kilometers" INTEGER NOT NULL DEFAULT 0,
    "status" "WorkRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "projectCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" INTEGER,

    CONSTRAINT "WorkRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hardware" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "totalPriceCents" INTEGER NOT NULL,
    "vatRate" INTEGER NOT NULL DEFAULT 0,
    "status" "HardwareStatus" NOT NULL DEFAULT 'NEW',
    "month" INTEGER,
    "year" INTEGER,
    "assignedAt" TIMESTAMP(3),
    "sourceInvoiceItemId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hardware_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "totalVatCents" INTEGER NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'CZK',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "roundingMode" "RoundingMode",
    "generatedAt" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "pohodaXml" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingDraft" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "roundingMode" "RoundingMode",
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivedInvoice" (
    "id" SERIAL NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierIco" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3),
    "totalWithoutVatCents" INTEGER,
    "totalWithVatCents" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'CZK',
    "digest" TEXT NOT NULL,
    "status" "ReceivedInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "sourceFilePath" TEXT,
    "ocrPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" INTEGER,

    CONSTRAINT "ReceivedInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivedInvoiceItem" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "productCode" TEXT,
    "quantity" DECIMAL(18,4),
    "unitPriceCents" INTEGER NOT NULL,
    "totalPriceCents" INTEGER NOT NULL,
    "vatRate" INTEGER NOT NULL DEFAULT 0,
    "status" "ReceivedInvoiceItemStatus" NOT NULL DEFAULT 'PENDING',
    "assignedOrganizationId" INTEGER,
    "assignedMonth" INTEGER,
    "assignedYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceivedInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "diffJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");

-- CreateIndex
CREATE INDEX "WorkRecord_month_year_idx" ON "WorkRecord"("month", "year");

-- CreateIndex
CREATE INDEX "WorkRecord_projectCode_idx" ON "WorkRecord"("projectCode");

-- CreateIndex
CREATE UNIQUE INDEX "Hardware_sourceInvoiceItemId_key" ON "Hardware"("sourceInvoiceItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_month_year_idx" ON "Invoice"("month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "BillingDraft_organizationId_month_year_key" ON "BillingDraft"("organizationId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivedInvoice_digest_key" ON "ReceivedInvoice"("digest");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_year_month_key" ON "AccountingPeriod"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRecord" ADD CONSTRAINT "WorkRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRecord" ADD CONSTRAINT "WorkRecord_billingOrgId_fkey" FOREIGN KEY ("billingOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRecord" ADD CONSTRAINT "WorkRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hardware" ADD CONSTRAINT "Hardware_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hardware" ADD CONSTRAINT "Hardware_sourceInvoiceItemId_fkey" FOREIGN KEY ("sourceInvoiceItemId") REFERENCES "ReceivedInvoiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingDraft" ADD CONSTRAINT "BillingDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedInvoiceItem" ADD CONSTRAINT "ReceivedInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ReceivedInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivedInvoiceItem" ADD CONSTRAINT "ReceivedInvoiceItem_assignedOrganizationId_fkey" FOREIGN KEY ("assignedOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

