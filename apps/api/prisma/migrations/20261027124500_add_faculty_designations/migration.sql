CREATE TABLE "faculty_designations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "faculty_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "faculty_designations_faculty_id_fkey"
      FOREIGN KEY ("faculty_id") REFERENCES "faculty" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "faculty_designations_term_id_fkey"
      FOREIGN KEY ("term_id") REFERENCES "academic_terms" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "faculty_designations_faculty_id_term_id_name_key"
ON "faculty_designations"("faculty_id", "term_id", "name");
CREATE INDEX "faculty_designations_faculty_id_term_id_idx"
ON "faculty_designations"("faculty_id", "term_id");

CREATE TABLE "designation_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "designation_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "day_of_week" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "designation_sessions_designation_id_fkey"
      FOREIGN KEY ("designation_id") REFERENCES "faculty_designations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "designation_sessions_designation_id_day_of_week_idx"
ON "designation_sessions"("designation_id", "day_of_week");
