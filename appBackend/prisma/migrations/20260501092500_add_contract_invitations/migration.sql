-- CreateEnum
CREATE TYPE "ContractInvitationTemplateType" AS ENUM ('DEFAULT', 'CUSTOM');

-- CreateTable
CREATE TABLE "ContractInvitation" (
    "id" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "ccEmails" JSONB,
    "subject" TEXT NOT NULL,
    "templateType" "ContractInvitationTemplateType" NOT NULL DEFAULT 'DEFAULT',
    "messageText" TEXT NOT NULL,
    "messageHtml" TEXT NOT NULL,
    "proposalFilename" TEXT NOT NULL,
    "resendEmailId" TEXT,
    "sentByUserId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractInvitation_recipientEmail_idx" ON "ContractInvitation"("recipientEmail");

-- CreateIndex
CREATE INDEX "ContractInvitation_sentAt_idx" ON "ContractInvitation"("sentAt");

-- CreateIndex
CREATE INDEX "ContractInvitation_sentByUserId_idx" ON "ContractInvitation"("sentByUserId");

-- AddForeignKey
ALTER TABLE "ContractInvitation" ADD CONSTRAINT "ContractInvitation_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
