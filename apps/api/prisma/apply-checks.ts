import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// NOTE (SQLite): SQLite cannot run `ALTER TABLE ... ADD CONSTRAINT`, so the
// former PostgreSQL CHECK constraints (schedule_slots_time_range_check,
// faculty_max_units_check, subjects_units_check) are not applied here. The
// same rules are enforced at the API layer by Zod, exactly as before:
//   end_time > start_time → validation/schedule-slot.validation.ts (assertTimeRange)
//   max_units > 0        → validation/faculty.validation.ts (maxUnitsSchema)
//   units > 0            → validation/subject.validation.ts (subjectUnitsSchema)
const CHECKS: string[] = [];

// Soft-delete-aware uniqueness (database-specification.md §7: "a common
// pattern is a partial unique index"). Soft-deleted rows keep their history
// without blocking reuse of their code / employee_no by future records.
// Prisma's @unique only emits full unique indexes, so these are applied as
// raw SQL. SQLite supports partial unique indexes natively — the same SQL is
// baked into the initial migration (prisma/migrations/*_sqlite_init/), and
// re-running it here is idempotent (DROP IF EXISTS + CREATE).
const SOFT_DELETE_INDEXES = [
  'DROP INDEX IF EXISTS "subjects_code_key"',
  'CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code") WHERE "deleted_at" IS NULL',
  'DROP INDEX IF EXISTS "faculty_employee_no_key"',
  'CREATE UNIQUE INDEX "faculty_employee_no_key" ON "faculty"("employee_no") WHERE "deleted_at" IS NULL',
];

async function main(): Promise<void> {
  for (const sql of [...CHECKS, ...SOFT_DELETE_INDEXES]) {
    try {
      await prisma.$executeRawUnsafe(sql);
      // eslint-disable-next-line no-console
      console.log('[checks] applied:', sql);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already exists')) {
        // eslint-disable-next-line no-console
        console.log('[checks] already present, skipping:', sql);
        continue;
      }
      throw err;
    }
  }
}

main()
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[checks] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
