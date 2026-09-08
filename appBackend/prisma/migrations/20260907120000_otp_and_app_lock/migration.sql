-- CreateEnum
CREATE TYPE "AppLockType" AS ENUM ('PIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "appLockType" "AppLockType",
ADD COLUMN "appLockSecretHash" TEXT,
ADD COLUMN "appLockFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "appLockLockedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpCode_email_idx" ON "OtpCode"("email");
