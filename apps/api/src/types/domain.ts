/**
 * String-literal unions replacing the Prisma enums dropped in the SQLite
 * migration (SQLite has no native enum type, so the schema stores plain
 * strings). Values are enforced at the API layer by Zod
 * (apps/api/src/validation/*.validation.ts) and mirror the shared TS enums
 * in packages/shared/src/index.ts — keep both in sync.
 */

/** Grid order for schedule days: MON..SAT. */
export const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/** RBAC roles (User.role). */
export type Role = 'CHAIR' | 'FACULTY' | 'ACADEMIC_ADMIN';

/** Faculty employment status (Faculty.employment_status). */
export type EmploymentStatus = 'FULL_TIME' | 'PART_TIME';

/** Weekly-grid days (ScheduleSlot.day_of_week). */
export type DayOfWeek = (typeof DAY_ORDER)[number];

/** Academic term semesters (AcademicTerm.semester). */
export type Semester = 'FIRST' | 'SECOND' | 'SUMMER';

/** Schedule block kind (ScheduleSlot.session_type). */
export type SessionType = 'LECTURE' | 'LAB';
