-- Preserve existing user rows and historical parent links without authorizing them.
-- Old PARENT accounts become unlinked STUDENT accounts. Login remains denied until
-- the teacher approves an email and that Clerk account claims its own student record.
ALTER TYPE "Role" RENAME VALUE 'PARENT' TO 'STUDENT';

ALTER TABLE "Student"
  ADD COLUMN "loginEmail" TEXT,
  ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "Student_loginEmail_key" ON "Student"("loginEmail");
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");

ALTER TABLE "Student"
  ADD CONSTRAINT "Student_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
