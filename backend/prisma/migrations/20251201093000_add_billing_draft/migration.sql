-- CreateTable
CREATE TABLE "BillingDraft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "organizationId" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "updatedBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingDraft_organizationId_month_year_key" ON "BillingDraft"("organizationId", "month", "year");

-- Trigger to update updatedAt column
CREATE TRIGGER "BillingDraft_updatedAt"
AFTER UPDATE ON "BillingDraft"
FOR EACH ROW
BEGIN
    UPDATE "BillingDraft" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = old."id";
END;
