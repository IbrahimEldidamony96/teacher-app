import { prisma } from "@/lib/prisma";
import { formatRange } from "@/lib/labels";

const groupSelect = { select: { id: true, name: true, gradeLevel: true } };
const slotOrder = [{ day: "asc" }, { startTime: "asc" }];

// Every session across all groups (the tutor's full week)
export function listAllSlots() {
  return prisma.weeklySlot.findMany({
    include: { group: groupSelect },
    orderBy: slotOrder,
  });
}

// Today's sessions in time order, with each group's student count
export function getTodaySlots(day) {
  return prisma.weeklySlot.findMany({
    where: { day },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          gradeLevel: true,
          _count: { select: { enrollments: true } },
        },
      },
    },
    orderBy: { startTime: "asc" },
  });
}

// Only children linked to this parent are ever loaded
export async function listChildrenSchedules(parentId) {
  const links = await prisma.parentStudent.findMany({
    where: { parentId },
    include: { student: { select: { id: true, name: true, gradeLevel: true } } },
    orderBy: { student: { name: "asc" } },
  });

  return Promise.all(
    links.map(async (link) => ({
      student: link.student,
      slots: await prisma.weeklySlot.findMany({
        where: { group: { enrollments: { some: { studentId: link.student.id } } } },
        include: { group: groupSelect },
        orderBy: slotOrder,
      }),
    }))
  );
}

export async function addSlot({ groupId, day, startTime, endTime, location }) {
  // One tutor: no two sessions may overlap, whatever the group
  // ("HH:mm" strings compare correctly)
  const clash = await prisma.weeklySlot.findFirst({
    where: { day, startTime: { lt: endTime }, endTime: { gt: startTime } },
    include: { group: { select: { name: true } } },
  });
  if (clash) {
    throw new Error(
      `عندك حصة تانية في نفس الوقت: ${clash.group.name} (${formatRange(clash.startTime, clash.endTime)}).`
    );
  }

  return prisma.weeklySlot.create({
    data: { groupId, day, startTime, endTime, location: location || null },
  });
}

export function deleteSlot(slotId) {
  return prisma.weeklySlot.deleteMany({ where: { id: slotId } });
}
