import { describe, expect, it } from 'vitest';
import { aggregateWorkload, statusOf, workloadToCsv } from './reports';
import type { WorkloadAssignment } from './workload-assignments';

function assignment(partial: Partial<WorkloadAssignment>): WorkloadAssignment {
  return {
    id: 'a-1',
    faculty_id: 'fac-1',
    subject_id: 'sub-1',
    section_id: 'sec-1',
    term_id: 'term-1',
    faculty_name: 'Ada Lovelace',
    subject_code: 'IE 21',
    subject_title: 'Operations Research 1',
    subject_units: 3,
    section_label: '1A (Year 1)',
    term_label: '2026-2027 — 1st Sem',
    lecture_hours: 3,
    lab_hours: 0,
    scheduled_lecture_hours: 3,
    scheduled_lab_hours: 0,
    remaining_lecture_hours: 0,
    remaining_lab_hours: 0,
    weekly_hours: 3,
    scheduled_hours: 3,
    remaining_hours: 0,
    color: null,
    slots: [],
    created_at: '2026-09-01T00:00:00.000Z',
    ...partial,
  };
}

describe('reports helpers', () => {
  it('aggregates assignments per faculty with load status', () => {
    const rows = aggregateWorkload(
      [
        assignment({ id: 'a-1', weekly_hours: 3, scheduled_hours: 3, remaining_hours: 0 }),
        assignment({ id: 'a-2', weekly_hours: 3, scheduled_hours: 0, remaining_hours: 3 }),
      ],
      new Map([['fac-1', { employee_no: 'TST-001', max_units: 6 }]]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      faculty_name: 'Ada Lovelace',
      subjects: 2,
      weekly_hours: 6,
      scheduled_hours: 3,
      status: 'ok',
    });
  });

  it('flags near and over load at 90 and 100 percent', () => {
    expect(statusOf(21.6, 24)).toBe('near');
    expect(statusOf(24, 24)).toBe('over');
    expect(statusOf(10, 24)).toBe('ok');
  });

  it('renders the workload summary as CSV', () => {
    const csv = workloadToCsv([
      {
        faculty_id: 'fac-1',
        faculty_name: 'Ada Lovelace',
        employee_no: 'TST-001',
        max_units: 24,
        subjects: 1,
        weekly_hours: 3,
        scheduled_hours: 3,
        remaining_hours: 0,
        load_ratio: 0.13,
        status: 'ok',
      },
    ]);
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('Ada Lovelace');
  });
});
