import { prisma } from '../config/prisma.js';
import type { CreateOtherFunctionSessionInput } from '../validation/other-function-session.validation.js';

export async function list(termId: string, facultyId: string) {
  return prisma.otherFunctionSession.findMany({
    where: { term_id: termId, faculty_id: facultyId },
    orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }],
  });
}

export async function findScheduleConflict(
  facultyId: string,
  termId: string,
  day: string,
  startTime: string,
  endTime: string,
): Promise<boolean> {
  const [classConflict, otherFunctionConflict, designationConflict] = await Promise.all([
    prisma.scheduleSlot.findFirst({
      where: {
        day_of_week: day,
        start_time: { lt: endTime },
        end_time: { gt: startTime },
        workload_assignment: {
          faculty_id: facultyId,
          term_id: termId,
          deleted_at: null,
        },
      },
      select: { id: true },
    }),
    prisma.otherFunctionSession.findFirst({
      where: {
        faculty_id: facultyId,
        term_id: termId,
        day_of_week: day,
        start_time: { lt: endTime },
        end_time: { gt: startTime },
      },
      select: { id: true },
    }),
    prisma.designationSession.findFirst({
      where: {
        day_of_week: day,
        start_time: { lt: endTime },
        end_time: { gt: startTime },
        designation: { faculty_id: facultyId, term_id: termId },
      },
      select: { id: true },
    }),
  ]);
  return Boolean(classConflict || otherFunctionConflict || designationConflict);
}

export async function findOtherFunctionOverlap(
  facultyId: string,
  termId: string,
  day: string,
  startTime: string,
  endTime: string,
): Promise<'OTHER_FUNCTION' | 'DESIGNATION' | null> {
  const [otherFunctionConflict, designationConflict] = await Promise.all([
    prisma.otherFunctionSession.findFirst({
      where: {
        faculty_id: facultyId,
        term_id: termId,
        day_of_week: day,
        start_time: { lt: endTime },
        end_time: { gt: startTime },
      },
      select: { id: true },
    }),
    prisma.designationSession.findFirst({
      where: {
        day_of_week: day,
        start_time: { lt: endTime },
        end_time: { gt: startTime },
        designation: { faculty_id: facultyId, term_id: termId },
      },
      select: { id: true },
    }),
  ]);
  if (otherFunctionConflict) return 'OTHER_FUNCTION';
  if (designationConflict) return 'DESIGNATION';
  return null;
}

export function create(
  facultyId: string,
  input: CreateOtherFunctionSessionInput & { title: string },
) {
  return prisma.otherFunctionSession.create({
    data: {
      faculty_id: facultyId,
      term_id: input.term_id,
      function_type: input.function_type,
      title: input.title,
      day_of_week: input.day_of_week,
      start_time: input.start_time.slice(0, 5),
      end_time: input.end_time.slice(0, 5),
    },
  });
}

export async function remove(id: string, facultyId: string): Promise<boolean> {
  const result = await prisma.otherFunctionSession.deleteMany({
    where: { id, faculty_id: facultyId },
  });
  return result.count > 0;
}
