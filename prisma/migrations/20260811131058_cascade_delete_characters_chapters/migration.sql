-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Chapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "illustrationPath" TEXT,
    "illustrationState" TEXT NOT NULL DEFAULT 'IDLE',
    "illustrationError" TEXT,
    CONSTRAINT "Chapter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Chapter" ("id", "illustrationError", "illustrationPath", "illustrationState", "order", "projectId", "prompt", "title") SELECT "id", "illustrationError", "illustrationPath", "illustrationState", "order", "projectId", "prompt", "title" FROM "Chapter";
DROP TABLE "Chapter";
ALTER TABLE "new_Chapter" RENAME TO "Chapter";
CREATE UNIQUE INDEX "Chapter_projectId_order_key" ON "Chapter"("projectId", "order");
CREATE TABLE "new_Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "portraitPath" TEXT,
    "portraitState" TEXT NOT NULL DEFAULT 'IDLE',
    "portraitError" TEXT,
    CONSTRAINT "Character_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Character" ("id", "name", "order", "portraitError", "portraitPath", "portraitState", "projectId", "prompt") SELECT "id", "name", "order", "portraitError", "portraitPath", "portraitState", "projectId", "prompt" FROM "Character";
DROP TABLE "Character";
ALTER TABLE "new_Character" RENAME TO "Character";
CREATE UNIQUE INDEX "Character_projectId_order_key" ON "Character"("projectId", "order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
