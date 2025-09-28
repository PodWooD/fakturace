/*
  Warnings:

  - You are about to drop the column `hours` on the `WorkRecord` table. All the data in the column will be lost.
  - You are about to drop the column `importedAt` on the `WorkRecord` table. All the data in the column will be lost.
  - You are about to drop the column `workerName` on the `WorkRecord` table. All the data in the column will be lost.
  - Added the required column `worker` to the `WorkRecord` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "createdBy" INTEGER,
ALTER COLUMN "code" DROP NOT NULL;

-- AlterTable
ALTER TABLE "WorkRecord" DROP COLUMN "hours",
DROP COLUMN "importedAt",
DROP COLUMN "workerName",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" INTEGER,
ADD COLUMN     "minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "worker" TEXT NOT NULL,
ALTER COLUMN "month" DROP NOT NULL,
ALTER COLUMN "year" DROP NOT NULL;
