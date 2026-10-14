-- Destructive privacy migration. Keep students' academic records; remove
-- old parent identities, contact numbers, and parent-directed message history.
BEGIN;
DELETE FROM "Notification";
DELETE FROM "CheckoutOrder"
WHERE "userId" IN (SELECT "id" FROM "User" WHERE "role" = 'PARENT');
DROP TABLE "ParentInvitation";
DROP TABLE "ParentStudent";
DELETE FROM "User" WHERE "role" = 'PARENT';
ALTER TYPE "Role" RENAME VALUE 'PARENT' TO 'STUDENT';
ALTER TABLE "Student"
  DROP COLUMN "parentPhone",
  ADD COLUMN "studentPhone" TEXT,
  ADD COLUMN "loginEmail" TEXT,
  ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "Student_loginEmail_key" ON "Student"("loginEmail");
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
