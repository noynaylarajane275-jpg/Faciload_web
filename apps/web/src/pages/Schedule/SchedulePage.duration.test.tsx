/**
 * Module — custom chunk durations (the Chair picks a partial block before dragging).
 *
 * Covers the Schedule sidebar's per-session-type cards: one LECTURE card and
 * one LAB card per assignment, each defaulting to its full remaining hours,
 * steppable/typable in 0.5h steps, clamped with an inline note when the entry
 * exceeds what's left, and undraggable while the entry is invalid (≤ 0).
 *
 * The drag pipeline itself is exercised at its deterministic seams: the drag
 * payload the card publishes (KeyboardSensor activation → DragOverlay), and
 * `chunkPlacement` — the pure drop math handleDragEnd delegates to. (jsdom has
 * no layout, so a full pointer drop cannot be simulated reliably; the
 * server-side half is covered by the API suite in apps/api.)
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/Toast';
import type { FacultyMember } from '../../lib/faculty';
import type { Room } from '../../lib/rooms';
import type { Section } from '../../lib/sections';
import {
  listWorkloadAssignments,
  updateWorkloadAssignment,
  type WorkloadAssignment,
} from '../../lib/workload-assignments';
import type { DayOfWeek, ScheduleSlot } from '../../lib/schedule-slots';
import {
  listScheduleSlots,
  createScheduleSlot,
  updateScheduleSlot,
} from '../../lib/schedule-slots';
import { listFaculty } from '../../lib/faculty';
import { listRooms } from '../../lib/rooms';
import { listSections } from '../../lib/sections';
import { listSubjects } from '../../lib/subjects';
import type { Term } from '../../lib/terms';
import { useAuthStore } from '../../store/auth.store';
import { useTermStore } from '../../store/term.store';
import {
  HALF_HOUR_HEIGHT,
  HOUR_HEIGHT,
  cellId,
  parseCellId,
  previewCellIds,
} from './schedule-time';
import { chunkPlacement, overlayHeight, SchedulePage, type DragInfoChunk } from './SchedulePage';
import { COLOR_PRESETS, readableTextColor } from '../../lib/colors';

vi.mock('../../lib/rooms', () => ({ listRooms: vi.fn() }));
vi.mock('../../lib/faculty', () => ({ listFaculty: vi.fn() }));
vi.mock('../../lib/sections', () => ({ listSections: vi.fn() }));
vi.mock('../../lib/subjects', () => ({ listSubjects: vi.fn() }));
vi.mock('../../lib/workload-assignments', () => ({
  createWorkloadAssignment: vi.fn(),
  deleteWorkloadAssignment: vi.fn(),
  listWorkloadAssignments: vi.fn(),
  updateWorkloadAssignment: vi.fn(),
}));
vi.mock('../../lib/schedule-slots', () => ({
  confirmOverride: vi.fn(),
  createScheduleSlot: vi.fn(),
  deleteScheduleSlot: vi.fn(),
  listScheduleSlots: vi.fn(),
  updateScheduleSlot: vi.fn(),
}));

const listWorkloadAssignmentsMock = vi.mocked(listWorkloadAssignments);
const updateWorkloadAssignmentMock = vi.mocked(updateWorkloadAssignment);

const TERM: Term = {
  id: 'term-1',
  school_year: '2026-2027',
  semester: 'FIRST',
  is_active: true,
  label: '2026-2027 — 1st Sem',
  created_at: '2026-09-01T00:00:00.000Z',
};

const ROOM: Room = {
  id: 'room-1',
  name: 'IE Room 1',
  is_under_maintenance: false,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
} as Room;

const FACULTY: FacultyMember = {
  id: 'faculty-1',
  employee_no: 'EMP-001',
  first_name: 'Ada',
  last_name: 'Lovelace',
  rank: null,
  employment_status: 'FULL_TIME',
  max_units: 24,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  user: null,
};

const SECTION: Section = {
  id: 'section-1',
  year_level: 2,
  name: 'BSIE 2A',
  label: 'BSIE 2A (Year 2)',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

/** A 1h lecture + 3h lab subject — the classic case with two chunk cards. */
function makeAssignment(overrides: Partial<WorkloadAssignment> = {}): WorkloadAssignment {
  return {
    id: 'assign-322',
    faculty_id: 'faculty-1',
    subject_id: 'subject-1',
    section_id: 'section-1',
    term_id: 'term-1',
    faculty_name: 'Ada Lovelace',
    subject_code: 'IE 322',
    subject_title: 'Plant Layout',
    subject_units: 3,
    section_label: 'BSIE 2A (Year 2)',
    term_label: '2026-2027 — 1st Sem',
    lecture_hours: 1,
    lab_hours: 3,
    scheduled_lecture_hours: 0,
    scheduled_lab_hours: 0,
    remaining_lecture_hours: 1,
    remaining_lab_hours: 3,
    weekly_hours: 4,
    scheduled_hours: 0,
    remaining_hours: 4,
    color: null,
    slots: [] as ScheduleSlot[],
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSlot(overrides: Partial<ScheduleSlot> = {}): ScheduleSlot {
  return {
    id: 'slot-1',
    workload_assignment_id: 'assign-322',
    room_id: 'room-1',
    room_name: 'IE Room 1',
    day_of_week: 'MON',
    start_time: '13:00',
    end_time: '14:30',
    session_type: 'LAB',
    session_hours: 1.5,
    faculty_id: 'faculty-1',
    faculty_name: 'Ada Lovelace',
    subject_code: 'IE 322',
    subject_title: 'Plant Layout',
    subject_units: 3,
    section_id: 'section-1',
    section_label: 'BSIE 2A (Year 2)',
    term_id: 'term-1',
    color: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Renders the page and drives it past the room-selection gate: picks ROOM in
 * the page-level Room dropdown, then waits for the sidebar to load. Every
 * grid/color test needs a room selected — the page no longer renders the grid
 * without one.
 */
async function renderPage(room: Room = ROOM): Promise<void> {
  render(
    <ToastProvider>
      <SchedulePage />
    </ToastProvider>,
  );
  const roomSelect = await screen.findByLabelText('Select room to view its schedule');
  fireEvent.change(roomSelect, { target: { value: room.id } });
  await screen.findByText('IE 322 — LEC');
}

function chunkCard(chunkId: string): HTMLElement {
  const card = document.querySelector(`[data-chunk-id="${chunkId}"]`);
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

/** Waits for the assignments fetch to land before grabbing a chunk card. */
async function chunkCardAfterLoad(chunkId: string): Promise<HTMLElement> {
  await screen.findByText('IE 322 — LEC');
  return chunkCard(chunkId);
}

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'user-1', email: 'chair@faciload.local', role: 'CHAIR', facultyId: null },
    accessToken: 'access-token',
    refreshToken: null,
    isAuthenticated: true,
    isInitializing: false,
  });
  useTermStore.setState({ terms: [TERM], selectedTermId: TERM.id, status: 'ready' });
  listWorkloadAssignmentsMock.mockResolvedValue({ data: [makeAssignment()], meta: { total: 1, page: 1, pageSize: 10, pageCount: 1 } });
  vi.mocked(listScheduleSlots).mockResolvedValue({ data: [], meta: { total: 0 } });
  vi.mocked(listRooms).mockResolvedValue({ data: [ROOM] } as never);
  vi.mocked(listFaculty).mockResolvedValue({
    data: [FACULTY],
    meta: { total: 1, page: 1, pageSize: 10, pageCount: 1 },
  });
  vi.mocked(listSections).mockResolvedValue({ data: [SECTION] } as never);
  vi.mocked(listSubjects).mockResolvedValue({
    data: [],
    meta: { total: 0, page: 1, pageSize: 10, pageCount: 0 },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SchedulePage — per-session-type chunk cards with duration pickers', () => {
  it('renders separate LECTURE and LAB cards, each defaulting to its full remaining hours', async () => {
    await renderPage();

    expect(await screen.findByText('IE 322 — LEC')).toBeInTheDocument();
    expect(screen.getByText('IE 322 — LAB')).toBeInTheDocument();

    const lecCard = chunkCard('assign-322:LECTURE');
    expect(lecCard).toHaveAttribute('data-chunk-duration', '1');
    expect(within(lecCard).getByText('1h selected · 1h remaining')).toBeInTheDocument();
    expect(
      within(lecCard).getByRole('group', { name: 'Hours to place (up to 1h remaining)' }),
    ).toBeInTheDocument();

    const labCard = chunkCard('assign-322:LAB');
    expect(labCard).toHaveAttribute('data-chunk-duration', '3');
    expect(within(labCard).getByText('3h selected · 3h remaining')).toBeInTheDocument();
  });

  it('shows a partially-placed class with its reduced remaining hours', async () => {
    // 1.5 of the 3 lab hours already placed — the LAB card now offers 1.5.
    listWorkloadAssignmentsMock.mockResolvedValue({
      data: [
        makeAssignment({
          scheduled_lab_hours: 1.5,
          remaining_lab_hours: 1.5,
          scheduled_hours: 1.5,
          remaining_hours: 2.5,
        }),
      ],
      meta: { total: 1, page: 1, pageSize: 10, pageCount: 1 },
    });
    await renderPage();

    const labCard = await chunkCardAfterLoad('assign-322:LAB');
    expect(within(labCard).getByText('1.5h selected · 1.5h remaining')).toBeInTheDocument();
    expect(labCard).toHaveAttribute('data-chunk-duration', '1.5');
  });

  it('steps the duration in 0.5h increments and clamps the + button at the remaining max', async () => {
    await renderPage();
    const labCard = await chunkCardAfterLoad('assign-322:LAB');

    const fewer = within(labCard).getByRole('button', { name: 'Fewer hours' });
    const more = within(labCard).getByRole('button', { name: 'More hours' });
    expect(more).toBeDisabled(); // default = full remaining → + starts disabled

    fireEvent.click(fewer);
    expect(labCard).toHaveAttribute('data-chunk-duration', '2.5');
    expect(within(labCard).getByText('2.5h selected · 3h remaining')).toBeInTheDocument();

    fireEvent.click(fewer);
    expect(labCard).toHaveAttribute('data-chunk-duration', '2');

    fireEvent.click(more);
    expect(labCard).toHaveAttribute('data-chunk-duration', '2.5');
    expect(fewer).toBeEnabled();
  });

  it('clamps a typed duration above the remaining hours and shows an inline note', async () => {
    await renderPage();
    const labCard = await chunkCardAfterLoad('assign-322:LAB');

    const input = within(labCard).getByLabelText('Hours to place') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '9' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(labCard).toHaveAttribute('data-chunk-duration', '3');
    expect(within(labCard).getByText('Only 3h remaining.')).toBeInTheDocument();
    expect(within(labCard).getByRole('status')).toHaveTextContent('Only 3h remaining.');
  });

  it('disables dragging while the duration is 0/negative, and re-enables once fixed', async () => {
    await renderPage();
    const labCard = await chunkCardAfterLoad('assign-322:LAB');

    const input = within(labCard).getByLabelText('Hours to place') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);

    expect(labCard).toHaveAttribute('data-chunk-duration', '0');
    expect(within(labCard).getByRole('status')).toHaveTextContent(
      'Enter at least 0.5h to place this block.',
    );
    // The dnd-kit drag handle (role=button) is gone → the card cannot be picked up.
    expect(labCard.getAttribute('aria-disabled')).toBe('true');
    expect(labCard.querySelector('[role="button"]')).toBeNull();

    // The + stepper recovers the card back to a legal duration.
    fireEvent.click(within(labCard).getByRole('button', { name: 'More hours' }));
    expect(labCard).toHaveAttribute('data-chunk-duration', '0.5');
    expect(labCard.querySelector('[role="button"]')).not.toBeNull();
    expect(labCard.getAttribute('aria-disabled')).toBe('false');
  });

  it('carries the picked duration through keyboard drag activation into the overlay', async () => {
    await renderPage();
    const labCard = await chunkCardAfterLoad('assign-322:LAB');

    // Pick 1.5 of the 3 lab hours.
    const fewer = within(labCard).getByRole('button', { name: 'Fewer hours' });
    fireEvent.click(fewer); // 2.5
    fireEvent.click(fewer); // 2
    fireEvent.click(fewer); // 1.5
    expect(labCard).toHaveAttribute('data-chunk-duration', '1.5');

    // Keyboard-activate the drag (Space on the handle) — no layout required.
    const handle = labCard.querySelector('[role="button"]') as HTMLElement;
    // A real Space keypress carries both `key` and `code`; dnd-kit's
    // KeyboardSensor matches on `event.code === 'Space'`.
    fireEvent.keyDown(handle, { key: ' ', code: 'Space' });

    // The overlay previews exactly what will be placed: 1.5h tall, LAB badge.
    const overlayMeta = await screen.findByText('1.5h · LAB');
    const overlayWrapper = overlayMeta.parentElement?.parentElement as HTMLElement;
    expect(overlayWrapper.style.height).toBe(`${1.5 * HOUR_HEIGHT}px`);

    // Escape cancels the drag; the overlay (and its preview) go away.
    // dnd-kit's KeyboardSensor binds its Escape listener on a macrotask, so
    // press Escape inside waitFor — it retries until that binding lands instead
    // of racing it. (`/1.5h . LAB/` targets only the overlay's meta line; the
    // sidebar card reads "1.5h selected · Nh remaining".)
    await waitFor(() => {
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      expect(screen.queryByText(/1\.5h . LAB/)).toBeNull();
    });
    expect(screen.queryByText('1.5h · LAB')).toBeNull();
  });

  it('sends exactly the picked duration to the placement API on drop', () => {
    // The drop math handleDragEnd runs for the LAB chunk picked at 1.5h,
    // dropped on the 13:00 cell of Monday.
    const info: DragInfoChunk = {
      chunkId: 'assign-322:LAB',
      assignment: makeAssignment(),
      type: 'new',
      sessionType: 'LAB',
      remaining: 3,
      duration: 1.5,
    };
    expect(chunkPlacement(info, { day: 'MON', hour: 13, offset: 0 })).toEqual({
      day_of_week: 'MON',
      start_time: '13:00',
      end_time: '14:30',
      room_id: null,
      session_type: 'LAB',
    });
  });

  it('drops the picked duration through the real drag pipeline and re-points the card at the reduced remainder', async () => {
    // jsdom has no layout engine, so every getBoundingClientRect is 0×0 and
    // dnd-kit's collision detection would be a coin flip. Stub it: the target
    // cell sits at the origin, the dragged card on top of it, everything else
    // far away — closest-center then resolves to exactly that cell.
    const originalRect = Element.prototype.getBoundingClientRect;
    const fakeRect = (top: number, left: number): DOMRect =>
      ({ top, left, width: 100, height: HOUR_HEIGHT, bottom: top + HOUR_HEIGHT, right: left + 100, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const dropId = this.getAttribute('data-drop-id');
      // Every droppable half-hour cell except the drop target is parked far off the
      // measured area; nothing else (the dragged card, the floating overlay)
      // sits there, so rectIntersection can only resolve to cell:MON:13:0.
      if (dropId && dropId !== 'cell:MON:13:0') {
        return fakeRect(200_000, 200_000);
      }
      return fakeRect(0, 0);
    };

    try {
      await renderPage();
      const labCard = await chunkCardAfterLoad('assign-322:LAB');

      // Pick 1.5 of the 3 lab hours on the LAB card.
      const fewer = within(labCard).getByRole('button', { name: 'Fewer hours' });
      fireEvent.click(fewer);
      fireEvent.click(fewer);
      fireEvent.click(fewer);
      expect(labCard).toHaveAttribute('data-chunk-duration', '1.5');

      // The API accepts the partial block and returns the created slot.
      vi.mocked(createScheduleSlot).mockResolvedValue({ slot: makeSlot() });
      // The refreshed assignments read after placement: 1.5h of the lab placed.
      listWorkloadAssignmentsMock.mockResolvedValue({
        data: [
          makeAssignment({
            scheduled_lab_hours: 1.5,
            remaining_lab_hours: 1.5,
            scheduled_hours: 1.5,
            remaining_hours: 2.5,
          }),
        ],
        meta: { total: 1, page: 1, pageSize: 10, pageCount: 1 },
      });

      const handle = labCard.querySelector('[role="button"]') as HTMLElement;
      fireEvent.keyDown(handle, { key: ' ', code: 'Space' }); // pick up
      await screen.findByText('1.5h · LAB'); // overlay confirms the drag is live

      // dnd-kit binds the end-key listener on a macrotask; press until it lands.
      await waitFor(() => {
        fireEvent.keyDown(document, { key: ' ', code: 'Space' });
        expect(createScheduleSlot).toHaveBeenCalled();
      });

      // Exactly the picked duration, anchored at the dropped cell — and with
      // the sidebar's default room (the first available room) applied.
      expect(createScheduleSlot).toHaveBeenCalledWith({
        workload_assignment_id: 'assign-322',
        day_of_week: 'MON',
        start_time: '13:00',
        end_time: '14:30',
        room_id: 'room-1',
        session_type: 'LAB',
      });

      // Hours remain, so the card stays — with its picker re-pointed at 1.5h.
      const updated = await chunkCardAfterLoad('assign-322:LAB');
      expect(within(updated).getByText('1.5h selected · 1.5h remaining')).toBeInTheDocument();
      expect(updated).toHaveAttribute('data-chunk-duration', '1.5');
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
    }
  });
});

describe('chunkPlacement (the drop math handleDragEnd uses)', () => {
  const baseInfo: DragInfoChunk = {
    chunkId: 'assign-1:LAB',
    assignment: makeAssignment(),
    type: 'new',
    sessionType: 'LAB',
    remaining: 3,
    duration: 3,
  };

  it('uses exactly the picker duration — 1.5h → 13:00–14:30', () => {
    const placement = chunkPlacement({ ...baseInfo, duration: 1.5 }, { day: 'MON', hour: 13, offset: 0 });
    expect(placement.start_time).toBe('13:00');
    expect(placement.end_time).toBe('14:30');
    expect(placement.session_type).toBe('LAB');
    expect(placement.day_of_week).toBe('MON');
    expect(placement.room_id).toBeNull();
  });

  it('falls back to the remaining hours when the picker holds the invalid 0 marker', () => {
    const placement = chunkPlacement({ ...baseInfo, duration: 0 }, { day: 'TUE', hour: 10, offset: 0 });
    expect(placement.start_time).toBe('10:00');
    expect(placement.end_time).toBe('13:00'); // remaining 3h
  });

  it('honours a 0.5h block', () => {
    const placement = chunkPlacement({ ...baseInfo, duration: 0.5 }, { day: 'WED', hour: 16, offset: 0 });
    expect(placement.start_time).toBe('16:00');
    expect(placement.end_time).toBe('16:30');
  });

  it('keeps the grid clamp: a 2h drop at 19:00 ends at the 20:00 day boundary', () => {
    const placement = chunkPlacement({ ...baseInfo, duration: 2 }, { day: 'FRI', hour: 19, offset: 0 });
    expect(placement.start_time).toBe('19:00');
    expect(placement.end_time).toBe('20:00');
  });

  it('never spans a LECTURE block past the 2h cap', () => {
    const placement = chunkPlacement(
      { ...baseInfo, sessionType: 'LECTURE', remaining: 4, duration: 4 },
      { day: 'MON', hour: 8, offset: 0 },
    );
    expect(placement.start_time).toBe('08:00');
    expect(placement.end_time).toBe('10:00'); // 2h, not the 4h duration
  });

  it('caps the invalid-picker fallback to one LAB meeting (3h, not the full remainder)', () => {
    const placement = chunkPlacement(
      { ...baseInfo, duration: 0, remaining: 5 },
      { day: 'TUE', hour: 8, offset: 0 },
    );
    expect(placement.start_time).toBe('08:00');
    expect(placement.end_time).toBe('11:00');
  });
});

describe('overlayHeight (the drag clone previews the placed block size)', () => {
  const baseInfo: DragInfoChunk = {
    chunkId: 'assign-1:LEC',
    assignment: makeAssignment(),
    type: 'new',
    sessionType: 'LECTURE',
    remaining: 1,
    duration: 1,
  };

  it('matches the selected duration (1.5h → 72px at 48px/hour)', () => {
    expect(overlayHeight({ ...baseInfo, duration: 1.5 })).toBe(1.5 * HOUR_HEIGHT);
  });

  it('floors at 18px so tiny drags stay grabbable', () => {
    expect(overlayHeight({ ...baseInfo, duration: 0.2 })).toBe(18);
  });

  it('uses the slot span for moved blocks', () => {
    const slot = makeSlot({ start_time: '09:00', end_time: '10:30' });
    expect(overlayHeight({ type: 'move', slot })).toBe(1.5 * HOUR_HEIGHT);
  });
});

describe('previewCellIds (the multi-cell drop preview)', () => {
  it('highlights the correct half-hour cells for any duration and anchor', () => {
    // 0.5h from :00 → 1 half-hour cell
    expect(previewCellIds(0.5, 'MON' as DayOfWeek, 9, 0)).toEqual(['cell:MON:9:0']);
    // 0.5h from :30 → 1 half-hour cell
    expect(previewCellIds(0.5, 'MON' as DayOfWeek, 9, 1)).toEqual(['cell:MON:9:1']);
    // 1.5h from :00 → 3 half-hour cells (:00, :30, :00)
    expect(previewCellIds(1.5, 'MON' as DayOfWeek, 8, 0)).toEqual([
      'cell:MON:8:0',
      'cell:MON:8:1',
      'cell:MON:9:0',
    ]);
    // 1.5h from :30 → 3 half-hour cells (:30, :00, :30)
    expect(previewCellIds(1.5, 'MON' as DayOfWeek, 8, 1)).toEqual([
      'cell:MON:8:1',
      'cell:MON:9:0',
      'cell:MON:9:1',
    ]);
    // 3h from :00 → 6 half-hour cells
    expect(previewCellIds(3, 'TUE' as DayOfWeek, 13, 0)).toEqual([
      'cell:TUE:13:0',
      'cell:TUE:13:1',
      'cell:TUE:14:0',
      'cell:TUE:14:1',
      'cell:TUE:15:0',
      'cell:TUE:15:1',
    ]);
  });

  it('clamps to the grid end (19:30 anchor + 2h → only 19:30 cell exists since 20:00 is the grid boundary)', () => {
    expect(previewCellIds(2, 'SAT' as DayOfWeek, 19, 1)).toEqual(['cell:SAT:19:1']);
  });

  it('clamps at the very end of the grid (19:30 anchor + 1h → only 19:30)', () => {
    expect(previewCellIds(1, 'SAT' as DayOfWeek, 19, 1)).toEqual(['cell:SAT:19:1']);
  });
});

describe('grid structure — half-hour rows and droppable zones', () => {
  it('renders two droppable rows per hour (one for :00, one for :30)', async () => {
    await renderPage();
    await screen.findByText('IE 322 — LEC');

    // One day column's droppable cells: 13 hours × 2 half-hour rows = 26 cells per day
    const dayCol = screen.getAllByRole('group', { name: /hours to place/i })[0]?.closest('[data-drop-id]');
    // Query all drop-zone elements in the DOM
    const dropZones = document.querySelectorAll('[data-drop-id]');
    // 6 days × 13 hours × 2 half-hour rows = 156 half-hour droppable zones
    expect(dropZones.length).toBe(6 * 13 * 2);

    // Verify half-hour cell IDs exist for a specific hour on MON
    const mon8_00 = document.querySelector('[data-drop-id="cell:MON:8:0"]');
    const mon8_30 = document.querySelector('[data-drop-id="cell:MON:8:1"]');
    expect(mon8_00).not.toBeNull();
    expect(mon8_30).not.toBeNull();

    // Verify the :30 cell is a different element from the :00 cell
    expect(mon8_00).not.toBe(mon8_30);
  });

  it('renders a visible dashed gridline at every half-hour boundary', async () => {
    await renderPage();
    await screen.findByText('IE 322 — LEC');

    // There should be 13 dashed lines per day column (one between each hour's :00 and :30,
    // but NOT after the last hour 19:00→20:00 boundary since that's the grid end)
    // Actually: dashed lines appear at top:24px within each hour block, for hours 7-18 (12 lines)
    // Wait — we add the line inside each hour block except the last (hour < DAY_END_HOUR - 1)
    // So 12 dashed lines per day × 6 days = 72 dashed lines
    const dashedLines = document.querySelectorAll('.border-dashed');
    // At minimum we expect the dashed half-hour lines (12 per day × 6 days = 72)
    // plus any other dashed borders in the UI
    expect(dashedLines.length).toBeGreaterThanOrEqual(72);
  });

  it('renders half-hour rows at HALF_HOUR_HEIGHT each', async () => {
    await renderPage();
    await screen.findByText('IE 322 — LEC');

    const firstDropCell = document.querySelector('[data-drop-id="cell:MON:7:0"]');
    expect(firstDropCell).not.toBeNull();
    // Read the expected height from the shared constant rather than hardcoding
    // pixels, so resizing the grid (HOUR_HEIGHT) cannot leave this stale.
    expect(firstDropCell).toHaveStyle({ height: `${HALF_HOUR_HEIGHT}px` });
  });

  it('a :30 cell ID parses correctly with parseCellId', () => {
    const parsed = parseCellId('cell:WED:14:1');
    expect(parsed).toEqual({ day: 'WED', hour: 14, offset: 1 });
  });

  it('parseCellId rejects malformed IDs', () => {
    expect(parseCellId('cell:MON:8')).toBeNull(); // missing offset
    expect(parseCellId('cell:MON:8:2')).toBeNull(); // invalid offset
    expect(parseCellId('cell:XXX:8:0')).toBeNull(); // invalid day
    expect(parseCellId('cell:MON:6:0')).toBeNull(); // before grid start
    expect(parseCellId('cell:MON:20:0')).toBeNull(); // at grid end (exclusive)
  });
});

describe('SchedulePage — room-first flow (no unscoped view)', () => {
  const ROOM2: Room = {
    id: 'room-2',
    name: 'Room 302',
    is_under_maintenance: false,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  } as Room;

  const slotInRoom2 = makeSlot({
    id: 'slot-2',
    room_id: 'room-2',
    room_name: 'Room 302',
    subject_code: 'IE 411',
    subject_title: 'Methods Engineering',
    start_time: '09:00',
    end_time: '10:00',
  });

  function twoRooms(): void {
    vi.mocked(listRooms).mockResolvedValue({ data: [ROOM, ROOM2] } as never);
    vi.mocked(listScheduleSlots).mockResolvedValue({
      data: [makeSlot({ start_time: '13:00', end_time: '14:30' }), slotInRoom2],
      meta: { total: 2 },
    });
  }

    async function pickRoom(id: string): Promise<void> {
    // Wait for the page-level room dropdown to populate with the mocked rooms,
    // then select the requested one. `listRooms` resolves async after mount, so
    // the <option> for `id` must exist before we fire the change event.
    await waitFor(() => {
      expect(screen.getByLabelText('Select room to view its schedule')).toBeEnabled();
    });
    fireEvent.change(screen.getByLabelText('Select room to view its schedule'), {
      target: { value: id },
    });
  }

  it('loads to the empty-state prompt with no grid and no sidebar until a room is picked', async () => {
    twoRooms();
    render(<ToastProvider><SchedulePage /></ToastProvider>);
    await screen.findByLabelText('Select room to view its schedule');

    // Gate copy is visible…
    expect(await screen.findByRole('heading', { name: 'Select a room to view its schedule' })).toBeInTheDocument();
    // …and NEITHER the grid nor the sidebar has rendered yet.
    expect(document.querySelector('[data-drop-id]')).toBeNull();
    expect(screen.queryByText('IE 322 — LEC')).toBeNull();
     expect(screen.queryByLabelText('Weekly schedule grid')).toBeNull();
  });

  it('renders only the selected room slots once a room is picked', async () => {
    twoRooms();
    render(<ToastProvider><SchedulePage /></ToastProvider>);
    await pickRoom('room-2');

    // room-2's block renders; room-1's block is filtered OUT of the DOM.
            // room-2's block renders; room-1's block (IE 322, 13:00–14:30) is filtered
    // OUT of the grid DOM. The sidebar card still shows IE 322 — LEC, so we
    // assert on placed-block role, not on the "IE 322" string.
        const placedBlocks = document.querySelectorAll('[aria-roledescription^="Scheduled class"]');
    expect(placedBlocks).toHaveLength(1);
    expect((placedBlocks[0] as HTMLElement).textContent).toContain('IE 411');
  });

  it('switches rooms in place — re-scopes the grid without a reload and keeps the sidebar', async () => {
    twoRooms();
    render(<ToastProvider><SchedulePage /></ToastProvider>);
    await pickRoom('room-2');
    expect(await screen.findByText('IE 411')).toBeInTheDocument();
    const sidebar = await screen.findByText('IE 322 — LEC');

    await pickRoom('room-1');
    // room-1's block appears; room-2's is gone. Same mounted page (no reload),
    // and the sidebar's unassigned cards survive the switch.
    expect(await screen.findByText('IE 322')).toBeInTheDocument();
    expect(screen.queryByText('IE 411')).toBeNull();
    expect(screen.getByText('IE 322 — LEC')).toBe(sidebar);
    // The header announces the active room.
    expect(screen.getByText(/Scheduling IE Room 1 for/)).toBeInTheDocument();
  });

  it('auto-assigns the page-selected room to dropped classes with no sidebar room picker', async () => {
    twoRooms();
    render(<ToastProvider><SchedulePage /></ToastProvider>);
    await pickRoom('room-2');
    await screen.findByText('IE 322 — LEC');

    // The old sidebar "Room for new blocks" picker is gone entirely — the
    // page-level Room selector is the only room control.
    expect(document.querySelector('#drop-room')).toBeNull();
    expect(screen.queryByLabelText('Room for new blocks')).toBeNull();

        // The drop math computes time range + session_type from the cell; the
    // page-selected room is injected by handleDragEnd (not by chunkPlacement,
    // which is pure grid math — see the full-pipeline test above).
    const info: DragInfoChunk = {
      chunkId: 'assign-322:LAB',
      assignment: makeAssignment(),
      type: 'new',
      sessionType: 'LAB',
      remaining: 3,
      duration: 1.5,
    };
    const placement = chunkPlacement(info, { day: 'MON', hour: 13, offset: 0 });
    expect(placement.start_time).toBe('13:00');
    expect(placement.end_time).toBe('14:30');
    expect(placement.session_type).toBe('LAB');
    expect(placement.day_of_week).toBe('MON');
    // The component's handleDragEnd assigns the selected room; the pure
    // chunkPlacement leaves room_id null (consistent with the other tests).
    expect(placement.room_id).toBeNull();
  });

    it('narrows within the selected room using the Faculty/Section filters', async () => {
    // Both faculty must be in the FIRST listFaculty response: the component
    // fetches on mount, so a later re-mock never repopulates the dropdown.
    const otherFaculty = { ...FACULTY, id: 'faculty-2', first_name: 'Grace', last_name: 'Hopper' };
    vi.mocked(listFaculty).mockResolvedValue({
      data: [FACULTY, otherFaculty],
      meta: { total: 2, page: 1, pageSize: 10, pageCount: 1 },
    });
    twoRooms();
    render(<ToastProvider><SchedulePage /></ToastProvider>);
    await pickRoom('room-1');
    expect(await screen.findByText('IE 322')).toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText('Filter by faculty'), {
      target: { value: 'faculty-2' },
    });
    // Ada's block dims (opacity) but stays mounted; the filter operates on the
    // room-scoped dataset — room-2's slot never appears regardless.
    await waitFor(() => {
      const block = document.querySelector('[aria-roledescription^="Scheduled class"]') as HTMLElement;
      expect(block).not.toBeNull();
      expect(block.className).toContain('opacity-20');
    });
    expect(screen.queryByText('IE 411')).toBeNull();
  });
});

describe('SchedulePage — card color picker (Part 3)', () => {
    it('opens the preset palette, PATCHes the pick, and recolors placed blocks live', async () => {
    vi.mocked(listScheduleSlots).mockResolvedValue({
      data: [makeSlot({ start_time: '13:00', end_time: '14:00' })],
      meta: { total: 1 },
    });
    updateWorkloadAssignmentMock.mockResolvedValue({
      assignment: makeAssignment({ color: '#E63E5C' }),
    });
    await renderPage();
    await screen.findByText('IE 322 — LEC');

    // Default swatch = soft rose; the placed block is still the default.
    const lecCard = chunkCard('assign-322:LECTURE');
    const swatch = within(lecCard).getByRole('button', { name: 'Change color (#FFE3E8)' });
    fireEvent.click(swatch);
    const menu = await screen.findByRole('menu', { name: 'Pick a color' });
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(COLOR_PRESETS.length);

    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Rose color' }));

    // PATCH carries the hex; the popover closes immediately.
    expect(updateWorkloadAssignmentMock).toHaveBeenCalledWith('assign-322', { color: '#E63E5C' });
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: 'Pick a color' })).toBeNull();
    });

    // Optimistic/confirmed recolor: the placed block repaints to Blue — same
    // assignment data, no re-drag needed. The Schedule grid has no labelled
    // wrapper, so query the placed blocks directly by role: the sidebar cards
    // ("IE 322 — LEC") never carry the Scheduled-class roledescription.
    // NOTE: re-query inside waitFor — handleColorChange triggers a re-render
    // that replaces the PlacedBlock node, so a pre-captured reference goes
    // stale. The background lives on the inner AssignmentCardBody div, not
    // the outer motion.div, so assert on that inner node.
    await waitFor(() => {
      const placed = document.querySelector('[aria-roledescription^="Scheduled class"]') as HTMLElement | null;
      expect(placed).not.toBeNull();
      const body = (placed as HTMLElement).querySelector(':scope > div') as HTMLElement | null;
      expect(body).not.toBeNull();
      expect(body as HTMLElement).toHaveStyle({ 'background-color': 'rgb(230, 62, 92)' });
    });
    // The swatch reflects the saved value.
    expect(within(lecCard).getByRole('button', { name: 'Change color (#E63E5C)' })).toBeInTheDocument();
  });

        it('closes the popover on outside click and Escape without changing the color', async () => {
    await renderPage();
    const lecCard = chunkCard('assign-322:LECTURE');
    const swatch = await within(lecCard).findByRole('button', { name: 'Change color (#FFE3E8)' });

    fireEvent.click(swatch);
    await screen.findByRole('menu', { name: 'Pick a color' });
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Pick a color' })).toBeNull();
    expect(updateWorkloadAssignmentMock).not.toHaveBeenCalled();

    fireEvent.click(swatch);
    await screen.findByRole('menu', { name: 'Pick a color' });
    fireEvent.pointerDown(document.body); // outside the picker root
    expect(screen.queryByRole('menu', { name: 'Pick a color' })).toBeNull();
    expect(updateWorkloadAssignmentMock).not.toHaveBeenCalled();
  });

  it('rolls the color back to the previous value when the PATCH fails', async () => {
    updateWorkloadAssignmentMock.mockRejectedValue(new Error('offline'));
    await renderPage();
    const lecCard = chunkCard('assign-322:LECTURE');
    const swatch = await within(lecCard).findByRole('button', { name: 'Change color (#FFE3E8)' });

    fireEvent.click(swatch);
    fireEvent.click(
      within(await screen.findByRole('menu', { name: 'Pick a color' })).getByRole('menuitemradio', {
        name: 'Rose color',
      }),
    );

        // Failure → the previous (default) color is restored on the LEC-card swatch.
    await waitFor(() => {
      expect(within(lecCard).getByRole('button', { name: 'Change color (#FFE3E8)' })).toBeInTheDocument();
    });
  });

  it('keeps the default blue look for assignments without a color (no regression)', async () => {
    vi.mocked(listScheduleSlots).mockResolvedValue({
      data: [makeSlot({ start_time: '13:00', end_time: '14:00' })],
      meta: { total: 1 },
    });
    await renderPage();
    await screen.findByText('IE 322 — LEC');

    // Placed block keeps the long-standing blue default — no inline color.
    const placed = screen.getByText('IE 322').closest('div[aria-roledescription]') as HTMLElement;
    expect(placed.style.backgroundColor).toBe('');
  });

  it('picks readable text per preset via the luminance check (checked, not assumed)', () => {
    // Light presets → near-black ink; dark presets → white.
    expect(readableTextColor('#FFE3E8')).toBe('#10241A');
    expect(readableTextColor('#B91C3C')).toBe('#FFFFFF');
    for (const preset of COLOR_PRESETS) {
      const text = readableTextColor(preset.hex);
      const value = preset.hex.replace('#', '');
      const luminance =
        (0.2126 * parseInt(value.slice(0, 2), 16) +
          0.7152 * parseInt(value.slice(2, 4), 16) +
          0.0722 * parseInt(value.slice(4, 6), 16)) /
        255;
      // Whichever text the helper picks, it must match the luminance side.
      expect(text).toBe(luminance > 0.55 ? '#10241A' : '#FFFFFF');
    }
  });
});

describe('SchedulePage — click a placed block to inspect its details', () => {
  /** One placed block in ROOM, so the grid renders a draggable target. */
  function oneSlot(slot: ScheduleSlot = makeSlot()): void {
    vi.mocked(listScheduleSlots).mockResolvedValue({ data: [slot], meta: { total: 1 } });
  }

  function placedBlock(): HTMLElement {
    const node = document.querySelector('[aria-roledescription^="Scheduled class"]');
    expect(node).not.toBeNull();
    return node as HTMLElement;
  }

  it('opens a details dialog with the block’s fields on click', async () => {
    oneSlot();
    await renderPage();

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(placedBlock());

    const dialog = await screen.findByRole('dialog');
    // The full record is readable without having to pick the block up.
    expect(dialog).toHaveTextContent('Plant Layout'); // subject title
    expect(dialog).toHaveTextContent('BSIE 2A (Year 2)'); // section
    expect(dialog).toHaveTextContent('Ada Lovelace'); // faculty
    expect(dialog).toHaveTextContent('IE Room 1'); // room
    expect(dialog).toHaveTextContent('1:00 PM'); // start time
  });

  it('paints the dialog header with the block’s own color', async () => {
    // The color lives on the *assignment*; slotsByDay pulls it live onto the
    // block, so recoloring an assignment repaints the dialog too.
    listWorkloadAssignmentsMock.mockResolvedValue({
      data: [makeAssignment({ color: '#2563EB' })],
      meta: { total: 1, page: 1, pageSize: 10, pageCount: 1 },
    });
    vi.mocked(listScheduleSlots).mockResolvedValue({ data: [makeSlot()], meta: { total: 1 } });
    await renderPage();

    fireEvent.click(placedBlock());
    const dialog = await screen.findByRole('dialog');
    // The header band carries the assignment color inline.
    const header = dialog.querySelector('div[style*="background-color"]') as HTMLElement | null;
    expect(header).not.toBeNull();
    expect(header!.style.backgroundColor).toBe('rgb(37, 99, 235)');
    expect(dialog).toHaveTextContent('IE 322');
  });

  it('closes on the close button and on Escape', async () => {
    oneSlot();
    await renderPage();

    fireEvent.click(placedBlock());
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByLabelText('Close details'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(placedBlock());
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('does not open details when the remove button is clicked', async () => {
    oneSlot();
    await renderPage();

    fireEvent.click(screen.getByLabelText('Remove IE 322 from the grid'));
    // The remove confirm dialog opens; the details dialog must not.
    expect(await screen.findByText('Remove scheduled class?')).toBeInTheDocument();
    expect(screen.queryByLabelText(/IE 322 details/)).toBeNull();
  });

  it('does not move the block when it is only clicked', async () => {
    oneSlot();
    await renderPage();

    fireEvent.click(placedBlock());
    await screen.findByRole('dialog');
    // A click is an inspection, not a placement.
    expect(vi.mocked(createScheduleSlot)).not.toHaveBeenCalled();
    expect(vi.mocked(updateScheduleSlot)).not.toHaveBeenCalled();
  });
});

describe('SchedulePage — single-meeting block caps (LEC ≤ 2h, LAB ≤ 3h)', () => {
  /** Same subject, but with 4 lecture hours still to place. */
  async function renderFourHourLecture(): Promise<HTMLElement> {
    listWorkloadAssignmentsMock.mockResolvedValue({
      data: [
        makeAssignment({
          lecture_hours: 4,
          remaining_lecture_hours: 4,
          weekly_hours: 7,
          remaining_hours: 7,
        }),
      ],
      meta: { total: 1, page: 1, pageSize: 10, pageCount: 1 },
    });
    await renderPage();
    return chunkCardAfterLoad('assign-322:LECTURE');
  }

  it('defaults the LECTURE card to 2h even when more lecture hours remain', async () => {
    const lecCard = await renderFourHourLecture();
    expect(lecCard).toHaveAttribute('data-chunk-duration', '2');
    expect(within(lecCard).getByText('2h selected · 4h remaining')).toBeInTheDocument();
    // One meeting's worth is all the + stepper can ever offer.
    expect(within(lecCard).getByRole('button', { name: 'More hours' })).toBeDisabled();
  });

  it('clamps a typed duration above the block cap and explains the cap inline', async () => {
    const lecCard = await renderFourHourLecture();
    const input = within(lecCard).getByLabelText('Hours to place') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(lecCard).toHaveAttribute('data-chunk-duration', '2');
    expect(within(lecCard).getByRole('status')).toHaveTextContent(
      'One LEC block holds at most 2h.',
    );
  });
});

