-- AlterTable: drop images array column
ALTER TABLE "FieldKyc" DROP COLUMN IF EXISTS "images";

-- CreateTable: FieldKycImage
CREATE TABLE "FieldKycImage" (
  "id" TEXT NOT NULL,
  "fieldKycId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FieldKycImage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FieldKycImage" ADD CONSTRAINT "FieldKycImage_fieldKycId_fkey" FOREIGN KEY ("fieldKycId") REFERENCES "FieldKyc"("id") ON DELETE CASCADE ON UPDATE CASCADE;


