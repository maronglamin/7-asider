-- CreateTable
CREATE TABLE "FieldManager" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldManagerInvite" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldManagerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FieldManager_fieldId_userId_key" ON "FieldManager"("fieldId", "userId");

-- CreateIndex
CREATE INDEX "FieldManager_userId_idx" ON "FieldManager"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldManagerInvite_tokenHash_key" ON "FieldManagerInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "FieldManagerInvite_fieldId_email_idx" ON "FieldManagerInvite"("fieldId", "email");

-- CreateIndex
CREATE INDEX "FieldManagerInvite_email_idx" ON "FieldManagerInvite"("email");

-- One pending invite per field + email
CREATE UNIQUE INDEX "FieldManagerInvite_fieldId_email_pending_key"
ON "FieldManagerInvite"("fieldId", "email")
WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "FieldManager" ADD CONSTRAINT "FieldManager_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FieldKyc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldManager" ADD CONSTRAINT "FieldManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldManager" ADD CONSTRAINT "FieldManager_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldManagerInvite" ADD CONSTRAINT "FieldManagerInvite_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FieldKyc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldManagerInvite" ADD CONSTRAINT "FieldManagerInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
