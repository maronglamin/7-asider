-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('HOURLY', 'FULL_DAY', 'MULTI_DAY', 'CUSTOM');

-- DropForeignKey
ALTER TABLE "public"."FieldKycImage" DROP CONSTRAINT "FieldKycImage_fieldKycId_fkey";

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "type" "BookingType" NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingUnit" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hourStart" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldBooking" (
    "id" TEXT NOT NULL,
    "fieldKycId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Booking_userId_createdAt_idx" ON "Booking"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_fieldId_startAt_endAt_idx" ON "Booking"("fieldId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "BookingUnit_bookingId_idx" ON "BookingUnit"("bookingId");

-- CreateIndex
CREATE INDEX "BookingUnit_fieldId_date_idx" ON "BookingUnit"("fieldId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BookingUnit_fieldId_date_hourStart_key" ON "BookingUnit"("fieldId", "date", "hourStart");

-- CreateIndex
CREATE INDEX "FieldBooking_fieldKycId_date_idx" ON "FieldBooking"("fieldKycId", "date");

-- AddForeignKey
ALTER TABLE "FieldKycImage" ADD CONSTRAINT "FieldKycImage_fieldKycId_fkey" FOREIGN KEY ("fieldKycId") REFERENCES "FieldKyc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FieldKyc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingUnit" ADD CONSTRAINT "BookingUnit_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingUnit" ADD CONSTRAINT "BookingUnit_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FieldKyc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldBooking" ADD CONSTRAINT "FieldBooking_fieldKycId_fkey" FOREIGN KEY ("fieldKycId") REFERENCES "FieldKyc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldBooking" ADD CONSTRAINT "FieldBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
