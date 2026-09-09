-- AlterTable
ALTER TABLE "User" ADD COLUMN "deviceLockEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "lockedDeviceId" TEXT;

-- CreateTable
CREATE TABLE "UserDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "deviceName" TEXT,
    "brand" TEXT,
    "manufacturer" TEXT,
    "modelName" TEXT,
    "deviceType" TEXT,
    "osName" TEXT,
    "osVersion" TEXT,
    "imei" TEXT,
    "hardwareId" TEXT,
    "isEmulator" BOOLEAN NOT NULL DEFAULT false,
    "appVersion" TEXT,
    "lastIpAddress" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMonthlyDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceGroupKey" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "firstLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMonthlyDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceMonthlyUser" (
    "id" TEXT NOT NULL,
    "deviceGroupKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "firstLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceMonthlyUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_userId_fingerprint_key" ON "UserDevice"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "UserDevice_userId_lastSeenAt_idx" ON "UserDevice"("userId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserMonthlyDevice_userId_deviceGroupKey_yearMonth_key" ON "UserMonthlyDevice"("userId", "deviceGroupKey", "yearMonth");

-- CreateIndex
CREATE INDEX "UserMonthlyDevice_userId_yearMonth_idx" ON "UserMonthlyDevice"("userId", "yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceMonthlyUser_deviceGroupKey_userId_yearMonth_key" ON "DeviceMonthlyUser"("deviceGroupKey", "userId", "yearMonth");

-- CreateIndex
CREATE INDEX "DeviceMonthlyUser_deviceGroupKey_yearMonth_idx" ON "DeviceMonthlyUser"("deviceGroupKey", "yearMonth");

-- AddForeignKey
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_lockedDeviceId_fkey" FOREIGN KEY ("lockedDeviceId") REFERENCES "UserDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMonthlyDevice" ADD CONSTRAINT "UserMonthlyDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceMonthlyUser" ADD CONSTRAINT "DeviceMonthlyUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
