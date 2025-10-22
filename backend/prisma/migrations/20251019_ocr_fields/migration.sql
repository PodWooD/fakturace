ALTER TABLE "ReceivedInvoice" ADD COLUMN "ocrStatus" TEXT DEFAULT 'SUCCESS';
ALTER TABLE "ReceivedInvoice" ADD COLUMN "ocrError" TEXT;
