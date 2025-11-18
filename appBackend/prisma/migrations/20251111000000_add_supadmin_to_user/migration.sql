-- AlterTable: add supadmin flag to User
ALTER TABLE "User" ADD COLUMN "supadmin" BOOLEAN NOT NULL DEFAULT false;


