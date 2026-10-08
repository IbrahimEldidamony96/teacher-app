import { prisma } from "@/lib/prisma";

export function hasNotification(studentId, type, refId) {
  return prisma.notification
    .findFirst({ where: { studentId, type, refId, status: "sent" }, select: { id: true } })
    .then(Boolean);
}

export function logNotification({ studentId, type, refId, status, error }) {
  return prisma.notification.create({
    data: { studentId, type, refId, status, error: error ?? null },
  });
}
