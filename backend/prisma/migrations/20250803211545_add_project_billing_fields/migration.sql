-- AlterTable
ALTER TABLE "WorkRecord" ADD COLUMN     "billingOrgId" INTEGER,
ADD COLUMN     "projectCode" TEXT;

-- CreateIndex
CREATE INDEX "WorkRecord_projectCode_idx" ON "WorkRecord"("projectCode");

-- AddForeignKey
ALTER TABLE "WorkRecord" ADD CONSTRAINT "WorkRecord_billingOrgId_fkey" FOREIGN KEY ("billingOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
