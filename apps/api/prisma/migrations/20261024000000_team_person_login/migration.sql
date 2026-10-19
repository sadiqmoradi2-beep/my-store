-- Financial Personnel: optional login account (one user per person). Additive; existing people have none.
ALTER TABLE "TeamPerson" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "TeamPerson_userId_key" ON "TeamPerson"("userId");
ALTER TABLE "TeamPerson" ADD CONSTRAINT "TeamPerson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
