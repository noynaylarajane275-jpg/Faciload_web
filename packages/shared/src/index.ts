/**
 * Shared domain enums for FACILOAD.
 * These mirror the Prisma enums in apps/api/prisma/schema.prisma.
 * Keep both in sync; the frontend imports from here, never from Prisma.
 */

/** RBAC roles (database-specification.md: User.role). */
export enum Role {
  CHAIR = 'CHAIR',
  FACULTY = 'FACULTY',
  ACADEMIC_ADMIN = 'ACADEMIC_ADMIN',
}

/** Faculty employment status (database-specification.md: Faculty.employment_status). */
export enum EmploymentStatus {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
}

/** Weekly-grid days (database-specification.md: ScheduleSlot.day_of_week, MON..SAT). */
export enum DayOfWeek {
  MON = 'MON',
  TUE = 'TUE',
  WED = 'WED',
  THU = 'THU',
  FRI = 'FRI',
  SAT = 'SAT',
}

/** Academic term semesters (database-specification.md: AcademicTerm.semester). */
export enum Semester {
  FIRST = 'FIRST',
  SECOND = 'SECOND',
  SUMMER = 'SUMMER',
}
