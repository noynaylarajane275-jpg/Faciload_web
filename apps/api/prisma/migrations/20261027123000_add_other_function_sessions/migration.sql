CREATE TABLE "other_function_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "faculty_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "function_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "day_of_week" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "other_function_sessions_faculty_id_fkey"
      FOREIGN KEY ("faculty_id") REFERENCES "faculty" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "other_function_sessions_term_id_fkey"
      FOREIGN KEY ("term_id") REFERENCES "academic_terms" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "other_function_sessions_faculty_id_term_id_day_of_week_idx"
ON "other_function_sessions"("faculty_id", "term_id", "day_of_week");
