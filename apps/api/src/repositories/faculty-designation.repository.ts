import { prisma } from '../config/prisma.js';
import type {
  CreateDesignationSessionInput,
  CreateFacultyDesignationInput,
} from '../validation/faculty-designation.validation.js';

export async function list(facultyId: string, termId: string) {
  return prisma.facultyDesignation.findMany({
    where: { faculty_id: facultyId, term_id: termId },
    include: {
      sessions: { orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }] },
    },
    orderBy: { name: 'asc' },
  });
}

export function create(data: CreateFacultyDesignationInput) {
  return prisma.facultyDesignation.create({ data });
}

export function findById(id: string) {
  return prisma.facultyDesignation.findUnique({ where: { id } });
}

export async function createSession(
  data: CreateDesignationSessionInput & { title: string },
) {
  return prisma.designationSession.create({
    data: {
      designation_id: data.designation_id,
      title: data.title,
      day_of_week: data.day_of_week,
      start_time: data.start_time.slice(0, 5),
      end_time: data.end_time.slice(0, 5),
    },
    include: { designation: true },
  });
}

export async function removeDesignation(id: string): Promise<boolean> {
  const result = await prisma.facultyDesignation.deleteMany({ where: { id } });
  return result.count > 0;
}

export async function removeSession(id: string, facultyId: string): Promise<boolean> {
  const result = await prisma.designationSession.deleteMany({
    where: {
      id,
      designation: { faculty_id: facultyId },
    },
  });
  return result.count > 0;
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

export async function findDesignationOverlap(
  facultyId: string,
  termId: string,
  day: string,
  startTime: string,
  endTime: string,
): Promise<boolean> {
  const conflict = await prisma.designationSession.findFirst({
    where: {
      day_of_week: day,
      start_time: { lt: endTime },
      end_time: { gt: startTime },
      designation: { faculty_id: facultyId, term_id: termId },
    },
    select: { id: true },
  });
  return Boolean(conflict);
}
