import type { Faculty } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../errors/apiError.js';
import {
  countActiveAssignments,
  countAssignments,
  findActiveByEmployeeNo,
  findActiveById,
  findActiveWithUserById,
  list as listFacultyRows,
  create as createFacultyRow,
  update as updateFacultyRow,
  softDelete,
  type FacultyListParams,
  type FacultySortField,
  type FacultyWithUser,
  type SortDirection,
} from '../repositories/faculty.repository.js';
import { prisma } from '../config/prisma.js';
import { hashPassword } from './auth.service.js';
import {
  createFacultySchema,
  facultyExistingUserSchema,
  facultyQuerySchema,
  updateFacultySchema,
  type CreateFacultyInput,
  type UpdateFacultyInput,
} from '../validation/faculty.validation.js';

export interface LinkedUserDto {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
}

export interface FacultyDto {
  id: string;
  employee_no: string;
  first_name: string;
  last_name: string;
  rank: string | null;
  employment_status: 'FULL_TIME' | 'PART_TIME';
  max_units: number;
  created_at: string;
  updated_at: string;
  user: LinkedUserDto | null;
}

export interface FacultyListDto {
  data: FacultyDto[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}

/** Same central validation entry point as subject.service.ts. */
function parseOrBadRequest<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid request', parsed.error.flatten());
  }
  return parsed.data as z.infer<T>;
}

function toLinkedUserDto(user: FacultyWithUser['user']): LinkedUserDto | null {
  return user ? { id: user.id, email: user.email, role: user.role, is_active: user.is_active } : null;
}

export function toFacultyDto(faculty: FacultyWithUser): FacultyDto {
  return {
    id: faculty.id,
    employee_no: faculty.employee_no,
    first_name: faculty.first_name,
    last_name: faculty.last_name,
    rank: faculty.rank,
    employment_status: faculty.employment_status as 'FULL_TIME' | 'PART_TIME',
    max_units: faculty.max_units,
    created_at: faculty.created_at.toISOString(),
    updated_at: faculty.updated_at.toISOString(),
    user: toLinkedUserDto(faculty.user),
  };
}

export function toFacultyDtoFromRow(faculty: Faculty): Omit<FacultyDto, 'user'> & { user: null } {
  return {
    id: faculty.id,
    employee_no: faculty.employee_no,
    first_name: faculty.first_name,
    last_name: faculty.last_name,
    rank: faculty.rank,
    employment_status: faculty.employment_status as 'FULL_TIME' | 'PART_TIME',
    max_units: faculty.max_units,
    created_at: faculty.created_at.toISOString(),
    updated_at: faculty.updated_at.toISOString(),
    user: null,
  };
}

export async function listFaculty(rawQuery: unknown): Promise<FacultyListDto> {
  const query = parseOrBadRequest(facultyQuerySchema, rawQuery);
  const params: FacultyListParams = {
    search: query.search ?? null,
    page: query.page,
    pageSize: query.pageSize,
    sortBy: (query.sortBy ?? 'employee_no') as FacultySortField,
    sortDir: (query.sortDir ?? 'asc') as SortDirection,
  };
  const result = await listFacultyRows(params);
  return {
    data: result.rows.map(toFacultyDto),
    meta: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      pageCount: Math.max(1, Math.ceil(result.total / result.pageSize)),
    },
  };
}

export async function getFaculty(id: string): Promise<FacultyDto> {
  const faculty = await findActiveWithUserById(id);
  if (!faculty) {
    throw ApiError.notFound('Faculty member not found');
  }
  return toFacultyDto(faculty);
}

async function assertEmployeeNoAvailable(employeeNo: string, excludeId?: string): Promise<void> {
  const existing = await findActiveByEmployeeNo(employeeNo, excludeId);
  if (existing) {
    throw ApiError.conflict(
      'FACULTY_DUPLICATE_EMPLOYEE_NO',
      `Employee no "${existing.employee_no}" is already in use`,
      { field: 'employee_no', employee_no: existing.employee_no },
    );
  }
}

export async function createFaculty(rawBody: unknown): Promise<FacultyDto> {
  const input: CreateFacultyInput = parseOrBadRequest(createFacultySchema, rawBody);
  await assertEmployeeNoAvailable(input.employee_no);

  // Link an already-registered (self-registered, unlinked) user instead of
  // creating a new login. Validated + linked atomically with the faculty row.
  if (input.existing_user_id) {
    const target = await prisma.user.findUnique({ where: { id: input.existing_user_id } });
    if (!target) {
      throw ApiError.notFound('User account not found');
    }
    if (!target.is_active) {
      throw ApiError.conflict('USER_INACTIVE', 'That user account is deactivated', {
        field: 'existing_user_id',
      });
    }
    if (target.faculty_id) {
      throw ApiError.conflict('USER_ALREADY_LINKED', 'That user account is already linked to a faculty record', {
        field: 'existing_user_id',
      });
    }
    const created = await prisma.$transaction(async (tx) => {
      const faculty = await tx.faculty.create({ data: facultyFields(input) });
      await tx.user.update({
        where: { id: target.id },
        data: { faculty_id: faculty.id, role: 'FACULTY' },
      });
      return faculty;
    });
    const withUser = await findActiveWithUserById(created.id);
    return withUser ? toFacultyDto(withUser) : toFacultyDtoFromRow(created);
  }

  // No account requested → historical behavior (faculty row only, user: null).
  const account = input.account;
  if (!account) {
    const created = await createFacultyRow({ ...facultyFields(input), rank: input.rank ?? null });
    return toFacultyDtoFromRow(created);
  }

  // Opt-in login: provision the faculty AND a linked FACULTY user atomically so
  // a partially-created pair can never exist. The account email must be unique
  const emailTaken = await prisma.user.findUnique({ where: { email: account.email } });
  if (emailTaken) {
    throw ApiError.conflict('USER_EMAIL_IN_USE', `Email "${account.email}" is already in use`, {
      field: 'account.email',
      email: account.email,
    });
  }
  const passwordHash = await hashPassword(account.password);

  const created = await prisma.$transaction(async (tx) => {
    const faculty = await tx.faculty.create({ data: facultyFields(input) });
    await tx.user.create({
      data: {
        email: account.email,
        password_hash: passwordHash,
        role: 'FACULTY',
        faculty_id: faculty.id,
        is_active: true,
      },
    });
    return faculty;
  });

  // Reload with the user relation so the DTO echoes the freshly-linked login.
  const withUser = await findActiveWithUserById(created.id);
  return withUser ? toFacultyDto(withUser) : toFacultyDtoFromRow(created);
}

export interface UnlinkedUserDto {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

/**
 * Users that registered themselves but were never linked to a faculty record
 * (faculty_id IS NULL). The Chair picks one of these when creating a faculty
 * member with "use an existing account" instead of provisioning a new login.
 * CHAIR / ACADEMIC_ADMIN accounts are excluded — only FACULTY-role signups.
 */
export async function listUnlinkedUsers(): Promise<{ users: UnlinkedUserDto[] }> {
  const rows = await prisma.user.findMany({
    where: { faculty_id: null, is_active: true, role: 'FACULTY' },
    orderBy: { created_at: 'asc' },
    select: { id: true, email: true, role: true, created_at: true },
  });
  return {
    users: rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      created_at: row.created_at.toISOString(),
    })),
  };
}

/**
 * Link an already-registered (unlinked) user to an EXISTING faculty record.
 * Lets the Chair approve a self-registered account against a faculty row that
 * was created earlier without any login (the "connect it later" path).
 */
export async function linkExistingUser(facultyId: string, rawBody: unknown): Promise<FacultyDto> {
  const parsed = facultyExistingUserSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw ApiError.badRequest('Invalid request', parsed.error.flatten());
  }
  const faculty = await findActiveById(facultyId);
  if (!faculty) {
    throw ApiError.notFound('Faculty member not found');
  }
  const current = await findActiveWithUserById(facultyId);
  if (current?.user) {
    throw ApiError.conflict('FACULTY_ALREADY_LINKED', 'This faculty record already has a linked login', {
      field: 'faculty',
    });
  }
  const target = await prisma.user.findUnique({ where: { id: parsed.data.existing_user_id } });
  if (!target) {
    throw ApiError.notFound('User account not found');
  }
  if (!target.is_active) {
    throw ApiError.conflict('USER_INACTIVE', 'That user account is deactivated', {
      field: 'existing_user_id',
    });
  }
  if (target.faculty_id) {
    throw ApiError.conflict('USER_ALREADY_LINKED', 'That user account is already linked to a faculty record', {
      field: 'existing_user_id',
    });
  }
  await prisma.user.update({
    where: { id: target.id },
    data: { faculty_id: facultyId, role: 'FACULTY' },
  });
  const withUser = await findActiveWithUserById(facultyId);
  // findActiveWithUserById just confirmed the row; fallback is defensive.
  if (!withUser) {
    throw ApiError.notFound('Faculty member not found');
  }
  return toFacultyDto(withUser);
}

/** Strips the optional `account`/`existing_user_id` blocks so only real Faculty columns are written. */
function facultyFields(input: CreateFacultyInput): {
  employee_no: string;
  first_name: string;
  last_name: string;
  rank: string | null;
  employment_status: 'FULL_TIME' | 'PART_TIME';
  max_units: number;
} {
  return {
    employee_no: input.employee_no,
    first_name: input.first_name,
    last_name: input.last_name,
    rank: input.rank ?? null,
    employment_status: input.employment_status,
    max_units: input.max_units,
  };
}

export async function updateFaculty(id: string, rawBody: unknown): Promise<FacultyDto> {
  const input: UpdateFacultyInput = parseOrBadRequest(updateFacultySchema, rawBody);
  const existing = await findActiveById(id);
  if (!existing) {
    throw ApiError.notFound('Faculty member not found');
  }
  if (
    input.employee_no !== undefined &&
    input.employee_no.toLowerCase() !== existing.employee_no.toLowerCase()
  ) {
    await assertEmployeeNoAvailable(input.employee_no, id);
  }
  const updated = await updateFacultyRow(id, input);
  return toFacultyDtoFromRow(updated);
}

/**
 * Soft delete only — never a hard delete, so WorkloadAssignments (historical
 * schedules/workload reports) are never orphaned (database-specification.md §7).
 *
 * Two pre-delete guards:
 *
 * 1. ACTIVE WorkloadAssignment rows → delete is BLOCKED outright (no
 *    confirmation escape hatch). Documented choice: an active assignment
 *    means the faculty member is currently scheduled this term, so removing
 *    them is almost certainly a mistake — the Chair must unassign their
 *    workload first (Workload Assignment module). The 409 message is
 *    surfaced verbatim in the frontend delete confirmation dialog.
 * 2. Active linked User login → delete is allowed only with an explicit
 *    `?confirmLinkedUser=true` confirmation flag; the login is then
 *    deactivated in the same transaction as the soft delete (it would be
 *    meaningless without the faculty record).
 */
export async function deleteFaculty(
  id: string,
  rawQuery: { confirmLinkedUser?: unknown },
): Promise<void> {
  const faculty = await findActiveWithUserById(id);
  if (!faculty) {
    throw ApiError.notFound('Faculty member not found');
  }

  const confirmSchema = z
    .string()
    .refine((value) => ['true', '1'].includes(value.trim().toLowerCase()), {
      message: 'confirmLinkedUser must be "true"',
    })
    .optional();
  const confirmParsed = confirmSchema.safeParse(rawQuery.confirmLinkedUser);
  if (!confirmParsed.success) {
    throw ApiError.badRequest('Invalid query', confirmParsed.error.flatten());
  }
  const confirmLinkedUser = confirmParsed.data !== undefined;

  // Guard #1 — active workload assignments block the delete (see docstring
  // above for why this blocks instead of asking for confirmation).
  const activeAssignments = await countActiveAssignments(id);
  if (activeAssignments > 0) {
    throw ApiError.conflict(
      'FACULTY_HAS_ASSIGNMENTS',
      'This faculty member has active workload assignments and cannot be removed',
      { field: 'workloadAssignments', count: activeAssignments },
    );
  }

  // Guard #2 — active-login guard: a faculty record linked to an active User
  // login is only removable with an explicit confirmation flag (task requirement).
  if (faculty.user?.is_active && !confirmLinkedUser) {
    throw ApiError.conflict(
      'FACULTY_LINKED_USER',
      `This faculty member has an active login (${faculty.user.email}). Confirm to deactivate the login and remove the faculty record.`,
      { field: 'confirmLinkedUser', user_email: faculty.user.email },
    );
  }

  // FK-preservation is guaranteed by soft delete; assert the invariant so any
  // accidental hard-delete path is caught in tests.
  const assignments = await countAssignments(id);

  if (faculty.user?.is_active) {
    // Deactivate the login in the same logical step as the removal.
    await prisma.$transaction([
      prisma.faculty.update({ where: { id }, data: { deleted_at: new Date() } }),
      prisma.user.update({ where: { id: faculty.user.id }, data: { is_active: false } }),
    ]);
  } else {
    await softDelete(id);
  }

  if (assignments > 0) {
    // Sanity check: the referencing (historical, soft-deleted) assignments
    // must still exist — soft delete never removes referencing rows.
    const stillThere = await countAssignments(id);
    if (stillThere !== assignments) {
      throw new ApiError(500, 'FACULTY_DELETE_INVARIANT', 'Referencing assignments were removed unexpectedly');
    }
  }
}