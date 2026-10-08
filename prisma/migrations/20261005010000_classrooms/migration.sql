-- CreateEnum
CREATE TYPE "ClassroomMode" AS ENUM ('LIVE', 'RECORDING');

-- CreateEnum
CREATE TYPE "ClassroomStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "ClassroomMessageKind" AS ENUM ('QUESTION', 'REPLY', 'ANNOUNCEMENT');

-- CreateTable
CREATE TABLE "ClassroomSession" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mode" "ClassroomMode" NOT NULL,
    "status" "ClassroomStatus" NOT NULL DEFAULT 'DRAFT',
    "attendanceDate" DATE NOT NULL,
    "videoFile" TEXT,
    "videoName" TEXT,
    "videoMime" TEXT,
    "videoSize" INTEGER,
    "headcountEstimate" INTEGER,
    "headcountSamples" INTEGER NOT NULL DEFAULT 0,
    "teacherConnectionId" TEXT,
    "teacherLastSeenAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "attendanceConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassroomSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "inviteNonce" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "attendedSeconds" INTEGER NOT NULL DEFAULT 0,
    "connectionId" TEXT,
    "handRaised" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ClassroomParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomMessage" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "senderId" TEXT,
    "recipientId" TEXT,
    "kind" "ClassroomMessageKind" NOT NULL DEFAULT 'QUESTION',
    "body" TEXT NOT NULL,
    "replyToId" INTEGER,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassroomMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomSignal" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fromPeer" TEXT NOT NULL,
    "toPeer" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassroomSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassroomSession_ownerId_createdAt_idx" ON "ClassroomSession"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "ClassroomSession_groupId_attendanceDate_idx" ON "ClassroomSession"("groupId", "attendanceDate");

-- CreateIndex
CREATE INDEX "ClassroomParticipant_studentId_idx" ON "ClassroomParticipant"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassroomParticipant_sessionId_studentId_key" ON "ClassroomParticipant"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "ClassroomMessage_sessionId_id_idx" ON "ClassroomMessage"("sessionId", "id");

-- CreateIndex
CREATE INDEX "ClassroomMessage_senderId_idx" ON "ClassroomMessage"("senderId");

-- CreateIndex
CREATE INDEX "ClassroomMessage_recipientId_idx" ON "ClassroomMessage"("recipientId");

-- CreateIndex
CREATE INDEX "ClassroomMessage_replyToId_idx" ON "ClassroomMessage"("replyToId");

-- CreateIndex
CREATE INDEX "ClassroomSignal_sessionId_toPeer_id_idx" ON "ClassroomSignal"("sessionId", "toPeer", "id");

-- CreateIndex
CREATE INDEX "ClassroomSignal_createdAt_idx" ON "ClassroomSignal"("createdAt");

-- AddForeignKey
ALTER TABLE "ClassroomSession" ADD CONSTRAINT "ClassroomSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomSession" ADD CONSTRAINT "ClassroomSession_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudyGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomParticipant" ADD CONSTRAINT "ClassroomParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomParticipant" ADD CONSTRAINT "ClassroomParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomMessage" ADD CONSTRAINT "ClassroomMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomMessage" ADD CONSTRAINT "ClassroomMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "ClassroomParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomMessage" ADD CONSTRAINT "ClassroomMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "ClassroomParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomMessage" ADD CONSTRAINT "ClassroomMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ClassroomMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomSignal" ADD CONSTRAINT "ClassroomSignal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassroomSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
