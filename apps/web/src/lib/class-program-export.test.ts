import { describe, expect, it } from 'vitest';
import {
  buildClassProgramWorkbook,
  type ClassProgramWorkloadAssignment,
} from './class-program-export';

async function readBack(options: Parameters<typeof buildClassProgramWorkbook>[0]) {
  const buffer = await buildClassProgramWorkbook(options);
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.getWorksheet('Class Program')!;
}

function assignment(
  index: number,
  lectureHrs: number,
  labHrs: number,
): ClassProgramWorkloadAssignment {
  return {
    subjectCode: `SUBJ ${index}`,
    subjectTitle: `Subject ${index}`,
    sectionLabel: `Section ${index}`,
    facultyName: `Faculty ${index}`,
    lectureHrs,
    labHrs,
  };
}

describe('class-program-export workload section', () => {
  it('writes each workload and sums its lecture, lab, and total hours', async () => {
    const ws = await readBack({
      slots: [],
      workload: {
        lectureHrs: 0,
        labHrs: 0,
        numPreparations: 2,
        assignments: [assignment(1, 3, 1), assignment(2, 2, 3)],
      },
    });

    expect(ws.getCell(40, 2).value).toBe(5);
    expect(ws.getCell(40, 3).value).toBe(4);
    expect(ws.getCell(40, 4).value).toBe(9);
    expect(ws.getCell(42, 1).value).toContain('SUBJ 1 - Subject 1');
    expect(ws.getCell(42, 2).value).toBe(3);
    expect(ws.getCell(42, 3).value).toBe(1);
    expect(ws.getCell(42, 4).value).toBe(4);
    expect(ws.getCell(43, 2).value).toBe(2);
    expect(ws.getCell(43, 3).value).toBe(3);
    expect(ws.getCell(43, 4).value).toBe(5);
    expect(ws.getCell(44, 1).value).toBe('Sub-Total');
    expect(ws.getCell(44, 2).value).toBe(5);
    expect(ws.getCell(44, 3).value).toBe(4);
    expect(ws.getCell(44, 4).value).toBe(9);
    expect(ws.getCell(63, 4).value).toBe(9);
  }, 60_000);

  it('adds rows for every assignment without overwriting later workload sections', async () => {
    const assignments = Array.from({ length: 8 }, (_, index) =>
      assignment(index + 1, 1, 0.5),
    );
    const ws = await readBack({
      slots: [],
      workload: {
        lectureHrs: 8,
        labHrs: 4,
        numPreparations: 8,
        assignments,
      },
    });

    expect(ws.getCell(49, 1).value).toContain('SUBJ 8 - Subject 8');
    expect(ws.getCell(49, 4).value).toBe(1.5);
    expect(ws.getCell(50, 1).value).toBe('Sub-Total');
    expect(ws.getCell(50, 4).value).toBe(12);
    expect(ws.getCell(51, 1).value).toBe('B.  Other Functions:');
  }, 60_000);

  it('places and totals Research, Extension, IMP, and Consultation sessions', async () => {
    const ws = await readBack({
      slots: [],
      otherFunctionSessions: [
        {
          functionType: 'RESEARCH',
          title: 'Research',
          day_of_week: 'MON',
          start_time: '09:00',
          end_time: '10:00',
        },
      ],
      workload: {
        lectureHrs: 3,
        labHrs: 0,
        numPreparations: 1,
        otherFunctionTotals: {
          RESEARCH: 1,
          EXTENSION: 0.5,
          IMP: 1,
          CONSULTATION: 1.5,
        },
      },
    });

    expect(ws.getCell(18, 2).value).toBe('Research');
    expect(ws.getCell(52, 2).value).toBe(1);
    expect(ws.getCell(53, 2).value).toBe(0.5);
    expect(ws.getCell(54, 2).value).toBe(1);
    expect(ws.getCell(55, 2).value).toBe(1.5);
    expect(ws.getCell(56, 2).value).toBe(4);
    expect(ws.getCell(63, 4).value).toBe(7);
  }, 60_000);

  it('moves later Excel sections down when assignment rows need the space', async () => {
    const assignments = Array.from({ length: 10 }, (_, index) =>
      assignment(index + 1, 1, 0.5),
    );
    const ws = await readBack({
      slots: [],
      workload: {
        lectureHrs: 10,
        labHrs: 5,
        numPreparations: 10,
        assignments,
      },
    });

    expect(ws.getCell(51, 1).value).toContain('SUBJ 10 - Subject 10');
    expect(ws.getCell(52, 1).value).toBe('Sub-Total');
    expect(ws.getCell(53, 1).value).toBe('B.  Other Functions:');
    expect(ws.getCell(65, 1).value).toBe('Grand Total (A+B+C)');
  }, 60_000);

  it('exports designation sessions and designation totals, expanding for many designations', async () => {
    const designations = Array.from({ length: 5 }, (_, index) => ({
      name: `Designation ${index + 1}`,
      totalHours: index + 1,
    }));
    const ws = await readBack({
      slots: [],
      designationSessions: [{
        designationName: 'Designation 1',
        title: 'Designation 1',
        day_of_week: 'MON',
        start_time: '10:00',
        end_time: '11:30',
      }],
      workload: {
        lectureHrs: 3,
        labHrs: 0,
        numPreparations: 1,
        designationTotals: designations,
      },
    });

    expect(ws.getCell(20, 2).value).toBe('Designation 1');
    expect(ws.getCell(59, 1).value).toBe('Designation 1');
    expect(ws.getCell(63, 1).value).toBe('Designation 5');
    expect(ws.getCell(64, 1).value).toBe('Sub-Total');
    expect(ws.getCell(64, 2).value).toBe(15);
    expect(ws.getCell(66, 1).value).toBe('Grand Total (A+B+C)');
    expect(ws.getCell(66, 4).value).toBe(18);
  }, 60_000);
});
