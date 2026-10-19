/**
 * Module — Room Schedule view tests ("Classroom Utilization").
 * Confirms the page renders room tabs from the single rooms-overview call,
 * shows the selected room's slots in the Mon–Sat grid, switches tabs without
 * refetching, and shows the empty state for rooms with no bookings.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRoomsOverview,
  type RoomsOverview,
  type ScheduleViewSlot,
} from '../../lib/schedule-views';
import type { Term } from '../../lib/terms';
import { useTermStore } from '../../store/term.store';
import { RoomSchedulePage } from './RoomSchedulePage';

vi.mock('../../lib/schedule-views', () => ({ getRoomsOverview: vi.fn() }));

const getRoomsOverviewMock = vi.mocked(getRoomsOverview);

const TERM: Term = {
  id: 'term-1',
  school_year: '2026-2027',
  semester: 'FIRST',
  is_active: true,
  label: '2026-2027 — 1st Sem',
  created_at: '2026-09-01T00:00:00.000Z',
};

const ROOM_1_ROWS: ScheduleViewSlot[] = [
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
    room_name: 'IE Room 1',
    color: null,
  },
];

const OVERVIEW: RoomsOverview = {
  rooms: [
    { room_id: 'room-1', room_name: 'IE Room 1', slots: ROOM_1_ROWS },
    { room_id: 'room-2', room_name: 'IE Room 2', slots: [] },
  ],
  meta: { total_rooms: 2 },
};

beforeEach(() => {
  useTermStore.setState({ terms: [TERM], selectedTermId: TERM.id, status: 'ready' });
  getRoomsOverviewMock.mockResolvedValue(OVERVIEW);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RoomSchedulePage', () => {
  it('renders the selected room\'s slots into the grid with a tab per room', async () => {
    render(<RoomSchedulePage />);

    // Tabs exist for every room; the first room is selected automatically.
    expect(await screen.findByRole('tab', { name: 'IE Room 1' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'IE Room 2' })).toBeInTheDocument();
    expect(await screen.findByText('IE 21')).toBeInTheDocument();
    expect(screen.getAllByText('1A (Year 1)')).toHaveLength(2);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('IE 30')).toBeInTheDocument();
    expect(screen.getByText('Blaise Pascal')).toBeInTheDocument();
    expect(getRoomsOverviewMock).toHaveBeenCalledWith(TERM.id);
  });

  it('switches rooms like workbook tabs without extra requests, and empty rooms show the empty state', async () => {
    render(<RoomSchedulePage />);
    await screen.findByText('IE 21');

    // Switch to the empty room — the empty state replaces the grid.
    fireEvent.click(screen.getByRole('tab', { name: 'IE Room 2' }));
    expect(screen.getByRole('tab', { name: 'IE Room 2' })).toHaveAttribute('aria-selected', 'true');
    expect(
      await screen.findByText('No classes scheduled yet for this term.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Weekly schedule grid')).not.toBeInTheDocument();

    // Switching back is instant: all rooms arrived in the one overview call.
    fireEvent.click(screen.getByRole('tab', { name: 'IE Room 1' }));
    expect(await screen.findByText('IE 21')).toBeInTheDocument();
    expect(getRoomsOverviewMock).toHaveBeenCalledTimes(1);
  });
});
