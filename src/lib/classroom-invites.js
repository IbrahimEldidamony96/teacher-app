import { createHmac, timingSafeEqual } from "node:crypto";

function signature(participant, secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("CLASSROOM_INVITE_SECRET must contain at least 32 characters.");
  }
  return createHmac("sha256", secret)
    .update(JSON.stringify([
      participant.sessionId, participant.id, participant.studentId, participant.inviteNonce,
    ]))
    .digest("base64url");
}

export function createClassroomInvite(participant, secret = process.env.CLASSROOM_INVITE_SECRET) {
  return `${participant.id}.${signature(participant, secret)}`;
}

export function inviteParticipantId(token) {
  if (typeof token !== "string" || token.length > 200) return null;
  return /^([a-zA-Z0-9_-]{10,100})\.[a-zA-Z0-9_-]{43}$/.exec(token)?.[1] ?? null;
}

export function verifyClassroomInvite(participant, token, secret = process.env.CLASSROOM_INVITE_SECRET) {
  if (inviteParticipantId(token) !== participant.id) return false;
  const received = Buffer.from(token.split(".")[1]);
  const expected = Buffer.from(signature(participant, secret));
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function classroomCookieName(sessionId) {
  return `classroom_${sessionId}`;
}
