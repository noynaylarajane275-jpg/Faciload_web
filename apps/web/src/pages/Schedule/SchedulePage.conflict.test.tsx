import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { OverrideDialog, ConflictDetailsList } from './SchedulePage';
import { toOverrideCandidate, CONFLICT_CODES, CONFLICT_LABELS } from './schedule-conflict';
import type { ConflictDetails, ConflictSlotSummary, SessionType } from '../../lib/schedule-slots';

// RTL's automatic cleanup needs a global `afterEach`, which this project's
// Vitest config (globals: false) does not provide — register it explicitly so
// each render starts from an empty document.
afterEach(cleanup);

describe('toOverrideCandidate (the 409 → shake/override branch)', () => {
  it('classifies every structured 409 conflict code as overridable', () => {
    for (const code of CONFLICT_CODES) {
      const err = Object.assign(new Error('blocked'), {
        status: 409,
        code,
        details: { conflicting_slots: [] },
      });
      const candidate = toOverrideCandidate(err);
      expect(candidate).not.toBeNull();
      expect(candidate?.code).toBe(code);
      expect(candidate?.message).toBe('blocked');
    }
  });

  it('ignores non-409 errors and 409s without a known conflict code', () => {
    expect(toOverrideCandidate(Object.assign(new Error('nope'), { status: 500 }))).toBeNull();
    expect(toOverrideCandidate(Object.assign(new Error('bad'), { status: 400 }))).toBeNull();
    // A 409 with a code the override flow does not know (e.g. a duplicate-key
    // race) is NOT overridable — it must surface as a plain error toast.
    expect(
      toOverrideCandidate(Object.assign(new Error('dup'), { status: 409, code: 'SOMETHING_ELSE' })),
    ).toBeNull();
    expect(toOverrideCandidate(new Error('network down'))).toBeNull();
  });
});

describe('OverrideDialog (what a 409 actually renders)', () => {
  const details: ConflictDetails = {
    day_of_week: 'MON',
    start_time: '08:00',
    end_time: '09:00',
    conflicting_slots: [
      {
        slot_id: 'slot-1',
        assignment_id: 'a1',
        faculty_name: 'Maria Santos',
        subject_code: 'IE 105',
        section_label: 'BSIE 2A',
        room_name: 'IE Lab 1',
        day_of_week: 'MON',
        start_time: '08:00',
        end_time: '09:00',
      } as ConflictSlotSummary,
    ],
  };

  function renderDialog(overrides: Partial<Parameters<typeof OverrideDialog>[0]> = {}) {
    const props = {
      state: {
        mode: 'create' as const,
        assignmentId: 'a1',
        placement: { day_of_week: 'MON' as const, start_time: '08:00', end_time: '09:00', room_id: null, session_type: 'LECTURE' as SessionType },
        code: 'FACULTY_CONFLICT' as const,
        message: 'Faculty conflict: Maria Santos is already scheduled 8:00 AM–9:00 AM on MON.',
        details,
      },
      reason: '',
      busy: false,
      onReasonChange: () => undefined,
      onConfirm: () => undefined,
      onClose: () => undefined,
      ...overrides,
    };
    return render(<OverrideDialog {...props} />);
  }

  it('renders the conflict type, server message, and the booked class details', () => {
    renderDialog();
    // The conflict type appears twice by design (modal title + alert heading),
    // so scope the lookup to the alert region.
    expect(
      within(screen.getByRole('alert')).getByText(CONFLICT_LABELS.FACULTY_CONFLICT),
    ).toBeTruthy();
    expect(
      screen.getByText(/Maria Santos is already scheduled/),
    ).toBeTruthy();
    // The structured details: what is already booked in that window.
    expect(screen.getByText(/IE 105 · BSIE 2A · Maria Santos/)).toBeTruthy();
    expect(screen.getByText(/IE Lab 1/)).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('types a reason and confirms the override through the Place anyway button', () => {
    let confirmed = false;
    let typed = '';
    renderDialog({
      onConfirm: () => {
        confirmed = true;
      },
      onReasonChange: (value) => {
        typed = value;
      },
    });
    fireEvent.change(screen.getByLabelText('Reason (optional, recorded in the audit log)'), {
      target: { value: 'Approved by the Dean' },
    });
    expect(typed).toBe('Approved by the Dean');
    fireEvent.click(screen.getByRole('button', { name: 'Place anyway' }));
    expect(confirmed).toBe(true);
  });

  it('shows the maintenance message distinctly for ROOM_MAINTENANCE', () => {
    renderDialog({
      state: {
        mode: 'create',
        assignmentId: 'a1',
        placement: { day_of_week: 'MON', start_time: '08:00', end_time: '09:00', room_id: null, session_type: 'LECTURE' as SessionType },
        code: 'ROOM_MAINTENANCE',
        message: 'Room IE Lab 1 is under maintenance and cannot be booked.',
        details: null,
      },
    });
    expect(
      within(screen.getByRole('alert')).getByText(CONFLICT_LABELS.ROOM_MAINTENANCE),
    ).toBeTruthy();
    expect(
      screen.getByText(/is under maintenance and cannot be booked/),
    ).toBeTruthy();
  });
});

describe('ConflictDetailsList', () => {
  it('renders nothing when there are no conflicting slots', () => {
    const { container } = render(<ConflictDetailsList details={null} />);
    expect(container.firstChild).toBeNull();
  });
});
