-- Add referenceProductCode column to ReceivedInvoiceItem
ALTER TABLE "ReceivedInvoiceItem"
ADD COLUMN "referenceProductCode" TEXT;
