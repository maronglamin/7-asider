-- CreateEnum
CREATE TYPE "SquadRole" AS ENUM ('CAPTAIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "BookingSide" AS ENUM ('HOME', 'AWAY');

-- CreateEnum
CREATE TYPE "SquadChallengeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Squad" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '⚽',
    "color" TEXT NOT NULL DEFAULT '#16a34a',
    "inviteCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Squad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SquadMember" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SquadRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SquadMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSquad" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "side" "BookingSide" NOT NULL DEFAULT 'HOME',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingSquad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SquadChallenge" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fromSquadId" TEXT NOT NULL,
    "toSquadId" TEXT,
    "token" TEXT NOT NULL,
    "status" "SquadChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "SquadChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Squad_inviteCode_key" ON "Squad"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "SquadMember_squadId_userId_key" ON "SquadMember"("squadId", "userId");

-- CreateIndex
CREATE INDEX "SquadMember_userId_idx" ON "SquadMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSquad_bookingId_squadId_key" ON "BookingSquad"("bookingId", "squadId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSquad_bookingId_side_key" ON "BookingSquad"("bookingId", "side");

-- CreateIndex
CREATE INDEX "BookingSquad_squadId_idx" ON "BookingSquad"("squadId");

-- CreateIndex
CREATE UNIQUE INDEX "SquadChallenge_token_key" ON "SquadChallenge"("token");

-- CreateIndex
CREATE INDEX "SquadChallenge_bookingId_status_idx" ON "SquadChallenge"("bookingId", "status");

-- CreateIndex
CREATE INDEX "SquadChallenge_fromSquadId_idx" ON "SquadChallenge"("fromSquadId");

-- CreateIndex
CREATE INDEX "SquadChallenge_toSquadId_idx" ON "SquadChallenge"("toSquadId");

-- AddForeignKey
ALTER TABLE "SquadMember" ADD CONSTRAINT "SquadMember_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SquadMember" ADD CONSTRAINT "SquadMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSquad" ADD CONSTRAINT "BookingSquad_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSquad" ADD CONSTRAINT "BookingSquad_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SquadChallenge" ADD CONSTRAINT "SquadChallenge_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SquadChallenge" ADD CONSTRAINT "SquadChallenge_fromSquadId_fkey" FOREIGN KEY ("fromSquadId") REFERENCES "Squad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SquadChallenge" ADD CONSTRAINT "SquadChallenge_toSquadId_fkey" FOREIGN KEY ("toSquadId") REFERENCES "Squad"("id") ON DELETE SET NULL ON UPDATE CASCADE;
