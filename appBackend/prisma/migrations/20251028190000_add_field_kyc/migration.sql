-- CreateEnum
CREATE TYPE "FieldKycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "FieldKyc" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "surfaceType" TEXT,
    "size" TEXT,
    "pricePerHour" DECIMAL(10,2),
    "hasLights" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "images" TEXT[] NOT NULL,
    "status" "FieldKycStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "suspensionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldKyc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FieldKyc_userId_key" ON "FieldKyc"("userId");

-- AddForeignKey
ALTER TABLE "FieldKyc" ADD CONSTRAINT "FieldKyc_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


