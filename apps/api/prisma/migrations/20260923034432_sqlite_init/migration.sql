-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'FACULTY',
    "faculty_id" TEXT,
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "faculty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employee_no" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "rank" TEXT,
    "employment_status" TEXT NOT NULL DEFAULT 'FULL_TIME',
    "max_units" INTEGER NOT NULL DEFAULT 24,
    "avatar_url" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" DATETIME
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "units" REAL NOT NULL,
    "lecture_hours" REAL NOT NULL DEFAULT 0,
    "lab_hours" REAL NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" DATETIME
);

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year_level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "is_under_maintenance" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "academic_terms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "school_year" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "workload_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "faculty_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "color" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" DATETIME,
    CONSTRAINT "workload_assignments_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculty" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "workload_assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "workload_assignments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "workload_assignments_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "academic_terms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "schedule_slots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workload_assignment_id" TEXT NOT NULL,
    "room_id" TEXT,
    "session_type" TEXT NOT NULL,
    "day_of_week" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "schedule_slots_workload_assignment_id_fkey" FOREIGN KEY ("workload_assignment_id") REFERENCES "workload_assignments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "schedule_slots_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_faculty_id_key" ON "users"("faculty_id");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_employee_no_key" ON "faculty"("employee_no");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sections_year_level_name_key" ON "sections"("year_level", "name");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_name_key" ON "rooms"("name");

-- CreateIndex
CREATE UNIQUE INDEX "academic_terms_school_year_semester_key" ON "academic_terms"("school_year", "semester");

-- CreateIndex
CREATE INDEX "workload_assignments_faculty_id_idx" ON "workload_assignments"("faculty_id");

-- CreateIndex
CREATE INDEX "workload_assignments_term_id_idx" ON "workload_assignments"("term_id");

-- CreateIndex
CREATE UNIQUE INDEX "workload_assignments_faculty_id_subject_id_section_id_term_id_key" ON "workload_assignments"("faculty_id", "subject_id", "section_id", "term_id");

-- CreateIndex
CREATE INDEX "schedule_slots_room_id_day_of_week_idx" ON "schedule_slots"("room_id", "day_of_week");

-- CreateIndex
CREATE INDEX "schedule_slots_workload_assignment_id_day_of_week_idx" ON "schedule_slots"("workload_assignment_id", "day_of_week");

-- Soft-delete-aware uniqueness (docs/4-database.md §7 partial unique index):
-- soft-deleted rows keep their history without blocking reuse of their
-- code / employee_no. Prisma's @unique cannot express a partial index, so
-- the equivalent raw SQL lives here (SQLite supports partial unique indexes
-- natively). Also re-applied idempotently by prisma/apply-checks.ts.
DROP INDEX IF EXISTS "subjects_code_key";
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code") WHERE "deleted_at" IS NULL;

DROP INDEX IF EXISTS "faculty_employee_no_key";
CREATE UNIQUE INDEX "faculty_employee_no_key" ON "faculty"("employee_no") WHERE "deleted_at" IS NULL;
