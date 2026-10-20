/**
 * Module — Section Schedule view tests ("Student Class Program").
 * Confirms the page renders the fetched view rows into the Mon–Sat grid
 * (subject + faculty + room per block) and shows the empty state when the
 * section has nothing scheduled for the term.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listSections, type Section } from '../../lib/sections';
import {
  getSectionSchedule,
  type ScheduleViewSlot,
  type SectionScheduleView,
} from '../../lib/schedule-views';
import type { Term } from '../../lib/terms';
import { useTermStore } from '../../store/term.store';
import { SectionSchedulePage } from './SectionSchedulePage';

vi.mock('../../lib/sections', () => ({ listSections: vi.fn() }));
vi.mock('../../lib/schedule-views', () => ({ getSectionSchedule: vi.fn() }));

const listSectionsMock = vi.mocked(listSections);
const getSectionScheduleMock = vi.mocked(getSectionSchedule);

const TERM: Term = {
  id: 'term-1',
  school_year: '2026-2027',
  semester: 'FIRST',
  is_active: true,
  label: '2026-2027 — 1st Sem',
  created_at: '2026-09-01T00:00:00.000Z',
};

const SECTION: Section = {
  id: 'section-1',
  year_level: 1,
  name: '1A',
  size: 40,
  label: '1A (Year 1)',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

const SECTION_ROWS: ScheduleViewSlot[] = [
  {
    day_of_week: 'MON',
    start_time: '07:00',
    end_time: '09:00',
    subject_code: 'IE 21',
    subject_title: 'Operations Research 1',
    faculty_name: 'Ada Lovelace',
    section_name: '1A (Year 1)',
    room_name: 'IE Room 1',
    color: null,
  },
  {
    day_of_week: 'WED',
    start_time: '09:00',
    end_time: '10:00',
    subject_code: 'IE 30',
    subject_title: 'Methods of Research',
    faculty_name: 'Blaise Pascal',
    section_name: '1A (Year 1)',
    room_name: null,
    color: null,
  },
];

function viewFixture(data: ScheduleViewSlot[]): SectionScheduleView {
  return {
    section: { id: SECTION.id, name: SECTION.name, year_level: SECTION.year_level, label: SECTION.label },
    data,
    meta: { total: data.length },
  };
}

beforeEach(() => {
  useTermStore.setState({ terms: [TERM], selectedTermId: TERM.id, status: 'ready' });
  listSectionsMock.mockResolvedValue({ data: [SECTION], meta: { total: 1 } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * The picker's options come from an async section fetch, so wait for the option
 * to exist *before* changing the select: a `change` whose value has no matching
 * `<option>` yet is silently dropped by the DOM (the select falls back to ""),
 * which made this suite flaky under parallel load.
 */
async function pickSection(): Promise<void> {
  const select = await screen.findByLabelText('Select section');
  await screen.findByRole('option', { name: SECTION.label });
  fireEvent.change(select, { target: { value: SECTION.id } });
}

describe('SectionSchedulePage', () => {
  it('renders the fetched section slots into the Mon–Sat grid (subject + faculty + room per block)', async () => {
    getSectionScheduleMock.mockResolvedValue(viewFixture(SECTION_ROWS));
    render(<SectionSchedulePage />);
    await pickSection();

    expect(await screen.findByText('IE 21')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('IE Room 1')).toBeInTheDocument();
    expect(screen.getByText('IE 30')).toBeInTheDocument();
    expect(screen.getByText('Blaise Pascal')).toBeInTheDocument();
    // A slot with no booked room renders as TBA, never blank.
    expect(screen.getByText('TBA')).toBeInTheDocument();
    // The full Mon–Sat week is on the form.
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
    expect(getSectionScheduleMock).toHaveBeenCalledWith(SECTION.id, TERM.id);
  });

  it('shows the empty state when the section has no scheduled slots for the term', async () => {
    getSectionScheduleMock.mockResolvedValue(viewFixture([]));
    render(<SectionSchedulePage />);
    await pickSection();
    expect(await screen.findByText('No classes scheduled yet for this term.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Weekly schedule grid')).not.toBeInTheDocument();
  });
});
