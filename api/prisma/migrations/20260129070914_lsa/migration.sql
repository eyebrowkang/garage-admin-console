/*
  Warnings:

  - You are about to drop the column `region` on the `Cluster` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Cluster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "adminToken" TEXT NOT NULL,
    "metricToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Cluster" ("adminToken", "createdAt", "endpoint", "id", "metricToken", "name", "updatedAt") SELECT "adminToken", "createdAt", "endpoint", "id", "metricToken", "name", "updatedAt" FROM "Cluster";
DROP TABLE "Cluster";
ALTER TABLE "new_Cluster" RENAME TO "Cluster";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
