-- AlterTable: add optional unique username to User
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Create unique index on username (ignore nulls is not supported in all Postgres; enforce uniqueness across non-null values)
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");


