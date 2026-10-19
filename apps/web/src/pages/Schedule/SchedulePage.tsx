import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { motion, useReducedMotion } from 'framer-motion';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { useAuthStore } from '../../store/auth.store';
import { selectSelectedTerm, useTermStore } from '../../store/term.store';
import { CONFLICT_LABELS, toOverrideCandidate } from './schedule-conflict';
import {
  MIN_CHUNK_HOURS,
  blockCapFor,
  clampChunkHours,
  chunkSessionBadge,
  defaultChunkHours,
  formatHours,
  isChunkDurationValid,
  stepChunkHours,
} from './schedule-duration';
import { listRooms, type Room } from '../../lib/rooms';
import {
  buildScheduleWorkbook,
  downloadWorkbook,
  exportFileName,
  loadSchoolLogo,
} from '../../lib/schedule-export';
import { listFaculty, type FacultyMember } from '../../lib/faculty';
import { listSections, type Section } from '../../lib/sections';
import {
  listWorkloadAssignments,
  updateWorkloadAssignment,
  type WorkloadAssignment,
} from '../../lib/workload-assignments';
import {
  COLOR_PRESETS,
  HEX_COLOR_PATTERN,
  assignmentColor,
  readableTextColor,
} from '../../lib/colors';
import {
  confirmOverride,
  createScheduleSlot,
  deleteScheduleSlot,
  listScheduleSlots,
  resetSchedule,
  updateScheduleSlot,
  type ConflictCode,
  type ConflictDetails,
  type DayOfWeek,
  type ResetScope,
  type ScheduleSlot,
  type SessionType,
} from '../../lib/schedule-slots';
import {
  DAYS,
  DAY_END_HOUR,
  DAY_LABELS,
  DAY_START_HOUR,
  GRID_HEIGHT,
  HALF_HOUR_HEIGHT,
  HOUR_HEIGHT,
  LUNCH_BREAK_END_MINUTES,
  LUNCH_BREAK_START_MINUTES,
  cellId,
  formatTime12h,
  halfHourRows,
  overlapsLunchBreak,
  parseCellId,
  placementRange,
  previewCellIds,
  rangeLabel,
  slotHeight,
  slotTop,
  timeToMinutes,
} from './schedule-time';

/**
 * Width of the drag details card, and the breathing room kept between it and the
 * viewport edge. Together they decide which side of the cursor the card opens
 * on during a drag (see `detailsOnLeft`).
 */
const DRAG_DETAILS_CARD_WIDTH = 256; // w-64
const GRID_EDGE_MARGIN = 24;

/**
 * Combined collision detection (dnd-kit's documented multi-sensor pattern):
 * pointer drags resolve via pointerWithin (precise cursor → hour cell), while
 * keyboard drags have no pointer coordinates and fall back to rectIntersection
 * against the translated active rect.
 */
const scheduleCollision: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }
  return rectIntersection(args);
};

/**
 * What is currently being dragged — an unassigned chunk or a placed block.
 * A "chunk" is one (assignment, session type) pair with hours still to place;
 * `duration` is the hours the card's picker had selected when the drag started.
 */
export interface DragInfoChunk {
  chunkId: string; // `${assignmentId}:${SessionType}` — uniquely identifies one draggable chunk
  assignment: WorkloadAssignment;
  type: 'new';
  sessionType: SessionType;
  /** Hours still placeable for this session type. */
  remaining: number;
  /** Hours this drag will place — the card picker's selected duration. */
  duration: number;
}
type DragInfo = DragInfoChunk | { type: 'move'; slot: ScheduleSlot };

interface Placement {
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  room_id: string | null;
  session_type: SessionType;
}

/**
 * The placement a drop produces for an unassigned chunk: exactly the duration
 * the card's picker had selected (falling back to the card's remaining hours
 * when the picker holds an invalid value), anchored at the dropped hour.
 * The span is always clamped to the session type's single-meeting cap
 * (LECTURE ≤ 2h, LAB ≤ 3h) — a bigger budget spills into a second block —
 * and `placementRange` still clamps the end to the grid's last hour.
 */
export function chunkPlacement(
  info: DragInfoChunk,
  cell: { day: DayOfWeek; hour: number; offset: 0 | 1 },
): Placement {
  const requested = info.duration > 0 ? info.duration : info.remaining;
  const hours = clampChunkHours(requested, info.remaining, blockCapFor(info.sessionType));
  const { start, end } = placementRange(cell.hour, cell.offset, hours);
  return {
    day_of_week: cell.day,
    start_time: start,
    end_time: end,
    room_id: null,
    session_type: info.sessionType,
  };
}

/**
 * Height (px) the drag overlay occupies — mirrors the height the placed block
 * will have on the grid (the picker's duration for fresh chunks, the slot's
 * own span for moves), so the dragged block previews its real placement size.
 */
export function overlayHeight(info: DragInfo): number {
  if (info.type === 'new') {
    return Math.max(18, info.duration * HOUR_HEIGHT);
  }
  return slotHeight(timeToMinutes(info.slot.start_time), timeToMinutes(info.slot.end_time));
}



export function sessionSessionLabel(type: SessionType): string {
  return type === 'LECTURE' ? 'LEC' : 'LAB';
}

/** Lunch-break drop guard shared by new placements and moves. */
export const LUNCH_BLOCK_MESSAGE =
  'Lunch break is reserved (12:00 PM – 1:00 PM) — pick a slot that ends by 12:00 PM or starts at 1:00 PM.';

export function lunchBlocked(placement: { start_time: string; end_time: string }): boolean {
  return overlapsLunchBreak(timeToMinutes(placement.start_time), timeToMinutes(placement.end_time));
}

/** A 409 caught mid-placement, waiting for the Chair to override or cancel. */
interface OverrideState {
  mode: 'create' | 'move';
  assignmentId: string;
  slotId?: string;
  placement: Placement;
  code: ConflictCode;
  message: string;
  details: ConflictDetails | null;
}

export function SchedulePage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const { pushToast } = useToast();
  const reduce = useReducedMotion();
  const canEdit = user?.role === 'CHAIR';

  // Term (shared with the header selector).
  const termStatus = useTermStore((s) => s.status);
  const loadTerms = useTermStore((s) => s.loadTerms);
  const selectedTermId = useTermStore((s) => s.selectedTermId);
  const term = useTermStore(selectSelectedTerm);

  useEffect(() => {
    if (termStatus === 'idle') {
      void loadTerms();
    }
  }, [termStatus, loadTerms]);

  // Reference data for dropdowns (the filters and the drop-room picker).
  const [rooms, setRooms] = useState<Room[]>([]);
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const results = await Promise.allSettled([
        listRooms(),
        listFaculty({ pageSize: 100 }),
        listSections(),
      ]);
      if (cancelled) {
        return;
      }
      if (results[0].status === 'fulfilled') setRooms(results[0].value.data);
      if (results[1].status === 'fulfilled') setFaculty(results[1].value.data);
      if (results[2].status === 'fulfilled') setSections(results[2].value.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Grid data, reloaded when the term changes or after any placement write.
  const [assignments, setAssignments] = useState<WorkloadAssignment[]>([]);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [gridStatus, setGridStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [reloadTick, setReloadTick] = useState(0);
  const requestIdRef = useRef(0);

  const loadGrid = useCallback(async () => {
    if (!selectedTermId) {
      setSlots([]);
      setAssignments([]);
      setGridStatus('ready');
      return;
    }
    const requestId = ++requestIdRef.current;
    try {
      const [assignmentRes, slotRes] = await Promise.all([
        listWorkloadAssignments({ termId: selectedTermId }),
        listScheduleSlots({ termId: selectedTermId }),
      ]);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setAssignments(assignmentRes.data);
      setSlots(slotRes.data);
      setGridStatus('ready');
    } catch {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setGridStatus('error');
    }
  }, [selectedTermId]);

  useEffect(() => {
    void loadGrid();
  }, [loadGrid, reloadTick]);

  // Filters dim non-matching blocks (transition-opacity) instead of hiding them.
  const [filterFacultyId, setFilterFacultyId] = useState('');
  const [filterSectionId, setFilterSectionId] = useState('');
  const isDimmed = useCallback(
    (facultyId: string, sectionId: string) =>
      (filterFacultyId !== '' && facultyId !== filterFacultyId) ||
      (filterSectionId !== '' && sectionId !== filterSectionId),
    [filterFacultyId, filterSectionId],
  );

  // The page is always room-scoped: nothing renders until a room is picked,
  // and the selected room is also the drop target for new blocks. Faculty and
  // Section act as secondary filters WITHIN the room (dimming non-matches).
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  // Only the selected room's slots render; switching rooms re-scopes instantly.
  const visibleSlots = useMemo(
    () => (selectedRoomId ? slots.filter((slot) => slot.room_id === selectedRoomId) : []),
    [slots, selectedRoomId],
  );

  // Drag + placement state.
  const [activeDrag, setActiveDrag] = useState<DragInfo | null>(null);
  /** Cell id under the pointer mid-drag — anchors the multi-cell drop preview. */
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [shakeCell, setShakeCell] = useState<string | null>(null);
  /**
   * Whether the drag details card should open to the LEFT of the cursor.
   * The card is ~256px wide and hangs off the cursor, so a drag near the right
   * edge of the viewport (the Sat column) would push it off-screen. Flipping
   * keeps every field readable wherever the block is dropped.
   */
  const [detailsOnLeft, setDetailsOnLeft] = useState(false);
  const [flashIds, setFlashIds] = useState<string[]>([]);
  const [override, setOverride] = useState<OverrideState | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [deletingSlot, setDeletingSlot] = useState<ScheduleSlot | null>(null);
  /**
   * Block opened by a click (not a drag) so its full record can be read in
   * place. Null when nothing is being inspected.
   */
  const [inspectedSlotId, setInspectedSlotId] = useState<string | null>(null);
  /** True while the .xlsx is being generated (exceljs is a lazy import). */
  const [exporting, setExporting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Schedule reset (Chair-only): clear placed blocks for the whole term, one
  // faculty, or the selected room — always gated by the Chair's password.
  const [resetOpen, setResetOpen] = useState(false);
  const [resetScope, setResetScope] = useState<ResetScope>('all');
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  // PointerSensor with a 4px activation distance so plain clicks still work;
  // KeyboardSensor gives the Tab/Space/arrow-key placement flow for free.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  /**
   * One draggable card per (assignment, session type) with hours still to
   * place — a subject with both lecture and lab hours shows a LECTURE card
   * and a LAB card, each with its own remaining budget and duration picker.
   * Subjects without a lecture/lab budget (hours fall back to units) keep a
   * single card with the weekly-based remaining, since their placements are
   * not hour-capped server-side.
   */
  const unassignedChunks = useMemo(() => {
    const chunks: Array<{
      assignment: WorkloadAssignment;
      sessionType: SessionType;
      remaining: number;
    }> = [];
    for (const assignment of assignments) {
      if (assignment.remaining_hours <= 0) {
        continue;
      }
      if (!(assignment.lecture_hours > 0) && !(assignment.lab_hours > 0)) {
        chunks.push({ assignment, sessionType: 'LAB', remaining: assignment.remaining_hours });
        continue;
      }
      if (assignment.remaining_lecture_hours > 0) {
        chunks.push({
          assignment,
          sessionType: 'LECTURE',
          remaining: assignment.remaining_lecture_hours,
        });
      }
      if (assignment.remaining_lab_hours > 0) {
        chunks.push({
          assignment,
          sessionType: 'LAB',
          remaining: assignment.remaining_lab_hours,
        });
      }
    }
    return chunks;
  }, [assignments]);

  const slotsByDay = useMemo(() => {
    // Placed blocks pull their color live from the assignment record (Part 3
    // Step 12): recoloring a sidebar card repaints its already-placed blocks
    // immediately — no re-drag, no reload.
    const colorByAssignment = new Map(assignments.map((a) => [a.id, a.color]));
    const map = new Map<DayOfWeek, ScheduleSlot[]>();
    for (const day of DAYS) {
      map.set(day, []);
    }
    for (const slot of visibleSlots) {
      const liveColor = colorByAssignment.get(slot.workload_assignment_id);
      map
        .get(slot.day_of_week)
        ?.push(liveColor === undefined ? slot : { ...slot, color: liveColor });
    }
    return map;
  }, [visibleSlots, assignments]);

  /**
   * The clicked block being inspected, looked up through `slotsByDay` so it
   * carries the same live color the block on the grid is painted with. Resolved
   * from the id rather than held as a slot so a reload (or a move) can never
   * leave a stale copy in the dialog.
   */
  const inspectedSlot = useMemo(() => {
    if (!inspectedSlotId) {
      return null;
    }
    for (const bucket of slotsByDay.values()) {
      const found = bucket.find((slot) => slot.id === inspectedSlotId);
      if (found) {
        return found;
      }
    }
    return null;
  }, [inspectedSlotId, slotsByDay]);

  function handleDragStart(event: DragStartEvent): void {
    const info = event.active.data.current as DragInfo | undefined;
    if (info) {
      setActiveDrag(info);
    }
    // Seed the side from where the drag began, so the details card never opens
    // off-screen before the first onDragMove fires.
    const x = event.active.rect.current.initial?.left ?? 0;
    setDetailsOnLeft(x > window.innerWidth - DRAG_DETAILS_CARD_WIDTH - GRID_EDGE_MARGIN);
  }

  /**
   * Keep the details card on whichever side of the cursor has room. Uses the
   * overlay's live left edge (viewport coordinates) rather than the raw pointer,
   * so it stays correct for keyboard drags too.
   */
  function handleDragMove(event: DragMoveEvent): void {
    const left = event.active.rect.current.translated?.left;
    if (typeof left !== 'number') {
      return;
    }
    setDetailsOnLeft(left > window.innerWidth - DRAG_DETAILS_CARD_WIDTH - GRID_EDGE_MARGIN);
  }

  /**
   * The anchored drop preview: `over` is the cell under the pointer (or the
   * keyboard focus), and the cells its selected duration spans light up too.
   */
  function handleDragOver(event: DragOverEvent): void {
    const overId = event.over?.id;
    setDragOverCell(typeof overId === 'string' ? overId : null);
  }

  function handleDragCancel(): void {
    setActiveDrag(null);
    setDragOverCell(null);
    setDetailsOnLeft(false);
  }

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    const info = activeDrag;
    setActiveDrag(null);
    setDragOverCell(null);
    setDetailsOnLeft(false);
    if (!info || !canEdit) {
      return;
    }
    const overId = event.over?.id;
    const cell = typeof overId === 'string' ? parseCellId(overId) : null;
    if (!cell) {
      return; // dropped outside the grid — the overlay just snaps back
    }
    const target = cellId(cell.day, cell.hour, cell.offset);
    if (info.type === 'new') {
      // Exactly the picker's selected duration — not the full remaining chunk.
      // The page-level selected room IS the drop target.
      const placement = chunkPlacement(info, cell);
      if (lunchBlocked(placement)) {
        pushToast('error', LUNCH_BLOCK_MESSAGE);
        setShakeCell(target);
        return;
      }
      await placeNew(
        info.assignment,
        { ...placement, room_id: selectedRoomId || null },
        target,
      );
    } else {
      const durationHours =
        (timeToMinutes(info.slot.end_time) - timeToMinutes(info.slot.start_time)) / 60;
      const { start, end } = placementRange(cell.hour, cell.offset, durationHours);
      const placement = { day_of_week: cell.day, start_time: start, end_time: end, room_id: info.slot.room_id, session_type: info.slot.session_type };
      if (lunchBlocked(placement)) {
        pushToast('error', LUNCH_BLOCK_MESSAGE);
        setShakeCell(target);
        return;
      }
      await moveSlot(
        info.slot,
        placement,
        target,
      );
    }
  }

  async function placeNew(
    assignment: WorkloadAssignment,
    placement: Placement,
    target: string,
  ): Promise<void> {
    try {
      const res = await createScheduleSlot({
        workload_assignment_id: assignment.id,
        ...placement,
      });
      applySlotResult(res.slot);
      const placedHours =
        (timeToMinutes(placement.end_time) - timeToMinutes(placement.start_time)) / 60;
      pushToast(
        'success',
        `${res.slot.subject_code} scheduled ${DAY_LABELS[placement.day_of_week]} ${formatTime12h(placement.start_time)} (${formatHours(placedHours)}h).`,
      );
    } catch (err) {
      handlePlacementError(err, {
        mode: 'create',
        assignmentId: assignment.id,
        placement,
        target,
      });
    }
  }

  async function moveSlot(slot: ScheduleSlot, placement: Placement, target: string): Promise<void> {
    try {
      const res = await updateScheduleSlot(slot.id, placement);
      applySlotResult(res.slot);
      pushToast(
        'success',
        `${slot.subject_code} moved to ${DAY_LABELS[placement.day_of_week]} ${formatTime12h(placement.start_time)}.`,
      );
    } catch (err) {
      handlePlacementError(err, {
        mode: 'move',
        assignmentId: slot.workload_assignment_id,
        slotId: slot.id,
        placement,
        target,
      });
    }
  }

  /** Upserts the slot into grid state and flags it for the springy entrance. */
  function applySlotResult(slot: ScheduleSlot): void {
    setSlots((current) => {
      const index = current.findIndex((existing) => existing.id === slot.id);
      if (index >= 0) {
        const next = [...current];
        next[index] = slot;
        return next;
      }
      return [...current, slot];
    });
    setFlashIds((ids) => (ids.includes(slot.id) ? ids : [...ids, slot.id]));
    void refreshAssignments();
  }

  async function refreshAssignments(): Promise<void> {
    if (!selectedTermId) {
      return;
    }
    try {
      const res = await listWorkloadAssignments({ termId: selectedTermId });
      setAssignments(res.data);
    } catch {
      // Keep the previous list; remaining-hour counts refresh on the next load.
    }
  }

  /**
   * Part 3: recolor one assignment. Optimistic — the sidebar swatch and every
   * already-placed block repaint immediately from `assignments` state, then
   * PATCH confirms (re-authoritative) or the previous color is restored.
   */
  async function handleColorChange(assignmentId: string, hex: string): Promise<void> {
    const previous = assignments.find((assignment) => assignment.id === assignmentId)?.color ?? null;
    setAssignments((current) =>
      current.map((assignment) =>
        assignment.id === assignmentId ? { ...assignment, color: hex } : assignment,
      ),
    );
    try {
      const res = await updateWorkloadAssignment(assignmentId, { color: hex });
      setAssignments((current) =>
        current.map((assignment) =>
          assignment.id === assignmentId ? { ...assignment, color: res.assignment.color } : assignment,
        ),
      );
      const subject = assignments.find((assignment) => assignment.id === assignmentId)?.subject_code;
      pushToast('success', `Color saved for ${subject ?? 'assignment'}.`);
    } catch {
      setAssignments((current) =>
        current.map((assignment) =>
          assignment.id === assignmentId ? { ...assignment, color: previous } : assignment,
        ),
      );
      pushToast('error', 'Could not save the color.');
    }
  }

  /**
   * 409 conflict/maintenance responses drive the shake + override dialog
   * instead of a silent failure; anything else surfaces as a toast.
   */
  function handlePlacementError(
    err: unknown,
    context: {
      mode: 'create' | 'move';
      assignmentId: string;
      slotId?: string;
      placement: Placement;
      target: string;
    },
  ): void {
    const candidate = toOverrideCandidate(err);
    if (candidate) {
      if (!reduce) {
        setShakeCell(context.target);
      }
      setOverrideReason('');
      setOverride({
        mode: context.mode,
        assignmentId: context.assignmentId,
        slotId: context.slotId,
        placement: context.placement,
        ...candidate,
      });
      return;
    }
    const apiErr = err as { message?: string };
    pushToast('error', apiErr?.message ?? 'Could not place the class.');
  }

  async function handleOverrideConfirm(): Promise<void> {
    if (!override) {
      return;
    }
    setOverrideBusy(true);
    try {
      const res = await confirmOverride(override.assignmentId, {
        ...(override.slotId ? { slot_id: override.slotId } : {}),
        ...override.placement,
        override_reason: overrideReason.trim() || undefined,
      });
      applySlotResult(res.slot);
      pushToast(
        'warning',
        `Placed with override — ${CONFLICT_LABELS[override.code].toLowerCase()} acknowledged.`,
      );
      setOverride(null);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Override failed.');
    } finally {
      setOverrideBusy(false);
    }
  }

  async function handleDeleteSlot(): Promise<void> {
    if (!deletingSlot) {
      return;
    }
    setDeleteBusy(true);
    try {
      await deleteScheduleSlot(deletingSlot.id);
      setSlots((current) => current.filter((slot) => slot.id !== deletingSlot.id));
      pushToast('success', `${deletingSlot.subject_code} removed from the grid.`);
      setDeletingSlot(null);
      void refreshAssignments();
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not remove the class.');
    } finally {
      setDeleteBusy(false);
    }
  }

  /**
   * Scoped schedule reset. Clears placed blocks only — assignments survive so
   * everything returns to "Unassigned classes". The Chair's account password
   * is re-verified server-side; a wrong password surfaces inline (not a
   * toast) so it can be retried without losing the dialog.
   */
  async function handleResetSchedule(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canEdit || !selectedTermId || resetBusy) {
      return;
    }
    if (resetScope === 'faculty' && !filterFacultyId) {
      setResetError('Pick a faculty member in the Faculty filter first.');
      return;
    }
    if (resetScope === 'room' && !selectedRoomId) {
      setResetError('Select a room first.');
      return;
    }
    if (!resetPassword) {
      setResetError('Enter your account password to confirm.');
      return;
    }
    setResetError(null);
    setResetBusy(true);
    try {
      const res = await resetSchedule({
        term_id: selectedTermId,
        ...(resetScope === 'faculty' ? { faculty_id: filterFacultyId } : {}),
        ...(resetScope === 'room' ? { room_id: selectedRoomId } : {}),
        password: resetPassword,
      });
      setResetOpen(false);
      setResetPassword('');
      pushToast(
        'success',
        res.deleted_count === 0
          ? 'Nothing to reset — no placed classes matched that scope.'
          : `Schedule reset — ${res.deleted_count} placed ${res.deleted_count === 1 ? 'class' : 'classes'} cleared.`,
      );
      setReloadTick((tick) => tick + 1);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Could not reset the schedule.');
    } finally {
      setResetBusy(false);
    }
  }

  /** Live assignment color per assignment id — the same source the grid uses. */
  const colorByAssignmentId = useMemo(
    () => new Map(assignments.map((a) => [a.id, a.color])),
    [assignments],
  );

  /** Distinct section programs on the grid, for the form's "Program:" field. */
  const programLabel = useMemo(() => {
    const programs = new Set(
      visibleSlots
        .map((slot) => slot.section_label.match(/^([A-Z]+)/)?.[1])
        .filter((code): code is string => Boolean(code)),
    );
    return [...programs].sort().join(', ') || 'BSIE';
  }, [visibleSlots]);

  function clearFlash(id: string): void {
    setFlashIds((ids) => ids.filter((flashId) => flashId !== id));
  }

  /**
   * Export the visible room's schedule as the printed Classroom Utilization
   * form, as a real .xlsx so Windows opens it in Excel.
   *
   * Uses the *filtered* slots (what is on screen right now) and the live
   * assignment colors, so the sheet matches both the current view and the
   * colors chosen for each subject.
   */
  async function handleExport(): Promise<void> {
    if (exporting) {
      return;
    }
    setExporting(true);
    try {
      // The seal lives in apps/web/public; several filenames are tried, and if
      // none are present the sheet is simply exported without it.
      const logo = await loadSchoolLogo();
      const buffer = await buildScheduleWorkbook({
        header: {
          title: 'CLASSROOM UTILIZATION',
          subtitle: term?.label ?? 'Active term',
          institution: [
            'Republic of the Philippines',
            'Palompon Institute of Technology',
            'Palompon, Leyte',
          ],
          college: 'College of Technology and Engineering',
          room: selectedRoom?.name ?? '—',
          program: programLabel,
          major: '',
          yearSection: '',
        },
        slots: visibleSlots,
        days: DAYS,
        startHour: DAY_START_HOUR,
        endHour: DAY_END_HOUR,
        colorFor: (slot) => colorByAssignmentId.get(slot.workload_assignment_id) ?? slot.color,
        logo,
      });
      downloadWorkbook(
        buffer,
        `${exportFileName('Classroom Utilization', selectedRoom?.name, term?.label)}.xlsx`,
      );
      pushToast('success', 'Excel file downloaded.');
    } catch {
      pushToast('error', 'Could not build the Excel file.');
    } finally {
      setExporting(false);
    }
  }



  const selectCls =
    'rounded-lg border border-leaf-100 bg-white px-2 py-1.5 text-xs text-ink outline-none transition-colors focus:border-leaf-500 focus:ring-4 focus:ring-leaf-500/15';
  const hours = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR },
    (_, index) => DAY_START_HOUR + index,
  );
  // The gutter renders a range label per half-hour row, not one per hour.
  const rows = useMemo(() => halfHourRows(), []);

  /**
   * Cells the drop preview lights up: the anchor cell plus however many
   * whole-hour cells the active drag's duration spans (1.5h → 2 cells,
   * 3h → 3 cells), so the preview matches what will actually be placed.
   */
  const dropPreview = useMemo(() => {
    if (!activeDrag || !dragOverCell) {
      return null;
    }
    const anchor = parseCellId(dragOverCell);
    if (!anchor) {
      return null;
    }
    const dragHours =
      activeDrag.type === 'new'
        ? activeDrag.duration
        : (timeToMinutes(activeDrag.slot.end_time) - timeToMinutes(activeDrag.slot.start_time)) / 60;
    return new Set(previewCellIds(dragHours, anchor.day, anchor.hour, anchor.offset));
  }, [activeDrag, dragOverCell]);

  /**
   * Ghost landing preview (Option A). Instead of FlowSched's green multi-cell
   * tint, a translucent copy of the actual block is parked where it would land:
   * the anchor cell's day + vertical position, sized to the duration that will
   * really be placed (`overlayHeight`), painted in the class's own color. The
   * spanned cells still carry `data-drop-preview` (for the duration test) but
   * stay visually clean — this ghost is the real feedback.
   */
  const ghostPreview = useMemo(() => {
    if (!activeDrag || !dragOverCell) {
      return null;
    }
    const anchor = parseCellId(dragOverCell);
    if (!anchor) {
      return null;
    }
    const startMinutes = (anchor.hour + anchor.offset * 0.5) * 60;
    const rawColor =
      activeDrag.type === 'new' ? activeDrag.assignment.color : activeDrag.slot.color;
    const color = rawColor && HEX_COLOR_PATTERN.test(rawColor) ? rawColor : '#FFE3E8';
    return {
      day: anchor.day,
      top: slotTop(startMinutes),
      height: overlayHeight(activeDrag),
      color,
      text: readableTextColor(color),
      title:
        activeDrag.type === 'new'
          ? `${activeDrag.assignment.subject_code} · ${chunkSessionBadge(activeDrag.sessionType)}`
          : activeDrag.slot.subject_code,
      subtitle:
        activeDrag.type === 'new'
          ? `${activeDrag.assignment.section_label} · ${activeDrag.assignment.faculty_name}`
          : `${activeDrag.slot.section_label} · ${activeDrag.slot.faculty_name}`,
    };
  }, [activeDrag, dragOverCell]);

  return (
    <section aria-labelledby="schedule-title" className="space-y-4">
      {/* Sticky command bar — identity, scope filters, and actions in ONE strip.
          Deliberately restructured from the old two-block layout (a header row
          with top-right actions, then a separate filters-only card) so the Chair
          workspace reads differently. Actions relocate to the far right of the
          unified bar, grouped as a segmented cluster after the scope filters. */}
      <div className="sticky top-0 z-20 rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 shadow-sm backdrop-blur print:static print:border-0 print:bg-white print:shadow-none">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-faciload-600 to-faciload-800 text-white shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </span>
            <h1 id="schedule-title" className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
              Schedule
            </h1>
          </div>

          <span aria-hidden="true" className="hidden h-6 w-px bg-slate-200 sm:block" />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              Room
              <select
                aria-label="Select room to view its schedule"
                value={selectedRoomId}
                onChange={(event) => setSelectedRoomId(event.target.value)}
                className={selectCls}
              >
                <option value="">Select a room…</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id} disabled={room.is_under_maintenance}>
                    {room.name}
                    {room.is_under_maintenance ? ' (maintenance)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              Faculty
              <select
                aria-label="Filter by faculty"
                value={filterFacultyId}
                onChange={(event) => setFilterFacultyId(event.target.value)}
                className={selectCls}
              >
                <option value="">All</option>
                {faculty.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.last_name}, {member.first_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              Section
              <select
                aria-label="Filter by section"
                value={filterSectionId}
                onChange={(event) => setFilterSectionId(event.target.value)}
                className={selectCls}
              >
                <option value="">All</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {canEdit ? (
            <div className="ml-auto flex items-center gap-2 border-l border-slate-200 pl-4 print:hidden">
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={!selectedRoomId || exporting}
                title="Export Classroom Utilization (.xlsx)"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#217346] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#185c37] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3v12" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M5 21h14" />
                </svg>
                {exporting ? 'Exporting…' : 'Export Report'}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={!selectedRoomId}
                title="Print Classroom Utilization (landscape, lunch break included)"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 9V2h12v7" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect width="12" height="8" x="6" y="14" />
                </svg>
                Print Classroom Utilization
              </button>
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                disabled={!selectedTermId}
                title="Reset schedule"
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-faciload-700 to-faciload-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v5h5" />
                </svg>
                Reset schedule
              </button>
            </div>
          ) : null}
        </div>

        <p className="mt-1.5 max-w-3xl text-xs text-slate-500 print:hidden">
          {selectedRoom
            ? `Scheduling ${selectedRoom.name} for ${term ? term.label : '…'}. Drag a class from the panel onto the grid — Tab + Space works too.`
            : `Scheduling for ${term ? term.label : '…'} — select a room to begin.`}
        </p>
        {/* Excel-style report header (screen + print): mirrors the Classroom
            Utilization sheet — title, term, and the room/program context the
            export writes. */}
        {selectedRoomId ? (
          <div className="cu-report-head mb-3 border border-black bg-white">
            <p className="border-b border-black py-1 text-center text-lg font-bold tracking-wide text-black">
              CLASSROOM UTILIZATION
            </p>
            <p className="border-b border-black py-0.5 text-center text-xs font-semibold text-black">
              {term ? term.label : 'Active term'}
            </p>
            <div className="grid grid-cols-2 text-[11px] text-black">
              <p className="border-r border-black px-2 py-0.5">
                <span className="font-bold">College:</span> College of Technology and Engineering
              </p>
              <p className="px-2 py-0.5">
                <span className="font-bold">Program:</span> {programLabel}
              </p>
              <p className="border-r border-t border-black px-2 py-0.5">
                <span className="font-bold">Room:</span> {selectedRoom ? selectedRoom.name : '—'}
              </p>
              <p className="border-t border-black px-2 py-0.5">
                <span className="font-bold">Major / Yr-Sec:</span>{' '}
                {filterSectionId
                  ? (sections.find((s) => s.id === filterSectionId)?.label ?? '—')
                  : 'All sections'}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {termStatus === 'ready' && !selectedTermId ? (
        <div className="rounded-xl border border-dashed border-leaf-200 bg-white px-4 py-10 text-center">
          <p className="text-sm font-medium text-ink">No active term.</p>
          <p className="mt-1 text-sm text-ink/60">
            Seed or activate an academic term, then reload this page.
          </p>
        </div>
      ) : termStatus === 'ready' && !selectedRoomId ? (
        // Entry gate: no grid, no sidebar — the room choice comes first
        // (ui-ux.md Section 12 empty-state pattern).
        <div
          role="status"
          className="rounded-xl border border-dashed border-leaf-200 bg-white px-4 py-12 text-center"
        >
          <h2 className="text-base font-semibold text-ink">Select a room to view its schedule</h2>
          <p className="mt-2 text-sm text-ink/60">
            Pick a room above — the week grid and the unassigned-classes panel will load for it.
          </p>
        </div>
      ) : gridStatus === 'error' ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-red-700">Could not load the schedule.</p>
          <button
            type="button"
            onClick={() => setReloadTick((tick) => tick + 1)}
            className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      ) : gridStatus === 'loading' && slots.length === 0 ? (
        <p className="rounded-xl border border-leaf-100 bg-white px-4 py-8 text-center text-sm text-ink/60">
          Loading schedule…
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={scheduleCollision}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {/* An empty room keeps its grid so classes can be dropped into it —
              just with an explicit banner instead of silence. */}
          {visibleSlots.length === 0 ? (
            <p
              role="status"
              className="mb-3 rounded-xl border border-dashed border-leaf-200 bg-white px-4 py-3 text-center text-sm text-ink/60"
            >
              No classes scheduled in {selectedRoom?.name ?? 'this room'} yet — drag a class from
              the panel to place one.
            </p>
          ) : null}
          <div className="flex items-start gap-4 flex-row-reverse" data-testid="schedule-grid">
            {/* Right rail: unassigned classes. The page-level room selector is
                the drop target — no second room picker. Reversed vs. the old
                layout so the week grid owns the primary (left) area. */}
            <aside className="w-72 shrink-0 space-y-3 glass-card rounded-2xl p-4 shadow-sm print:hidden">
              <div>
                <h2 className="text-sm font-semibold text-ink">Unassigned classes</h2>
                <p className="text-xs text-ink/50">{term ? term.label : 'Loading term…'}</p>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {unassignedChunks.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-leaf-200 px-3 py-4 text-center text-xs text-ink/60">
                    {assignments.length === 0
                      ? 'No workload assignments for this term yet — add one on the Workload Assignment page.'
                      : 'All assigned hours are on the grid.'}
                  </p>
                ) : (
                  unassignedChunks.map(({ assignment, sessionType, remaining }) => {
                    const chunkId = `${assignment.id}:${sessionType}`;
                    return (
                      <UnassignedCard
                        key={chunkId}
                        assignment={assignment}
                        sessionType={sessionType}
                        remaining={remaining}
                        dimmed={isDimmed(assignment.faculty_id, assignment.section_id)}
                        dragging={
                          activeDrag?.type === 'new' && activeDrag.chunkId === chunkId
                        }
                        onColorChange={handleColorChange}
                      />
                    );
                  })
                )}
              </div>
              {!canEdit ? (
                <p className="rounded-lg bg-leaf-50 px-3 py-2 text-[11px] text-ink/60">
                  View only — Chairs can place and move classes.
                </p>
              ) : null}
            </aside>

            {/* Time-gutter + day columns. Excel Classroom Utilization styling:
                light-green header band, white cells, thin dark borders, black
                text — the editing chrome (DnD, filters, sidebar) stays, but the
                grid itself reads like the printed form. */}
            <div className="cu-grid flex min-w-0 flex-1 overflow-x-auto rounded-none border border-black bg-white p-0 shadow-none">
              {/* `flex-1` on the inner row matters: without an explicit width the
                  flex row collapses to its content and the day columns stop
                  filling the panel, leaving dead space on the right. */}
              <div className="flex min-w-full flex-1">
                {/* Time gutter. One label per HALF-HOUR row, showing the row's
                    full `start - end` span so the exact drop target is readable
                    at a glance. `whitespace-nowrap` is load-bearing: without it
                    the range wraps to two lines and the labels stop lining up
                    with their rows. Height must match the grid cells exactly. */}
                {/* Wide enough for the longest label, the 11:30 AM - 12:00 PM row,
                    which is the one range that carries a marker on both ends. */}
                <div className="w-[132px] shrink-0 border-r border-black bg-white pr-2" aria-hidden="true">
                  <div className="cu-day-head flex h-7 items-center justify-end border-b border-black bg-[#9BBB59] px-2 text-[11px] font-bold text-black">
                    TIME
                  </div>
                  {rows.map((row) => (
                    <div
                      key={row.key}
                      className="cu-time-cell flex items-center justify-end whitespace-nowrap border-b border-black text-right font-mono text-[10px] leading-none tabular-nums text-black"
                      style={{ height: HALF_HOUR_HEIGHT }}
                    >
                      {rangeLabel(row)}
                    </div>
                  ))}
                </div>
                {DAYS.map((day) => {
                  const shaking = shakeCell?.startsWith(`cell:${day}:`) ?? false;
                  return (
                    <motion.div
                      key={day}
                      className="min-w-[132px] flex-1"
                      animate={
                        shaking && !reduce ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }
                      }
                      transition={
                        shaking && !reduce ? { duration: 0.4 } : { duration: 0 }
                      }
                      onAnimationComplete={() => {
                        if (shaking) {
                          setShakeCell(null);
                        }
                      }}
                    >
                      <div className="cu-day-head flex h-7 items-center justify-center border-b border-black bg-[#9BBB59] text-[11px] font-bold uppercase tracking-wide text-black">
                        {DAY_LABELS[day]}
                      </div>
                      <div className="cu-day-col relative border-l border-black bg-white" style={{ height: GRID_HEIGHT }}>
                        {hours.map((hour) => (
                          <React.Fragment key={`${day}-${hour}`}>
                            {/* :00 half-hour row (top half of the hour).
                                The 12:00–13:00 lunch band is non-droppable on
                                every day: two disabled cells, visually covered
                                by the LUNCH BREAK strip rendered below. */}
                            <DropCell
                              id={cellId(day, hour, 0)}
                              highlighted={dropPreview?.has(cellId(day, hour, 0)) ?? false}
                              disabled={hour === 12}
                            />
                            {/* Dashed half-hour gridline between :00 and :30. Kept
                                lighter than the solid hour line so the hour
                                boundaries still read as the primary structure. */}
                            <div
                              className="absolute left-0 right-0 border-t border-dashed border-leaf-200"
                              style={{ top: HALF_HOUR_HEIGHT }}
                            />
                            {/* :30 half-hour row (bottom half of the hour) */}
                            <DropCell
                              id={cellId(day, hour, 1)}
                              highlighted={dropPreview?.has(cellId(day, hour, 1)) ?? false}
                              disabled={hour === 12}
                            />
                          </React.Fragment>
                        ))}
                        {/* Reserved lunch break band (Mon–Sat, 12:00 PM – 1:00 PM):
                            absolutely positioned over the two 12:xx cells so no
                            class can be dropped or read there. Pointer events
                            stay on so the text is selectable; drops are refused
                            because the cells underneath are disabled AND
                            handleDragEnd rejects lunch overlaps. */}
                        <div
                          aria-label="Lunch break 12:00 PM to 1:00 PM"
                          className="cu-lunch absolute left-0 right-0 z-10 flex items-center justify-center border-y border-black bg-[#FFF2CC] px-1 text-center"
                          style={{
                            top: slotTop(LUNCH_BREAK_START_MINUTES),
                            height: Math.max(18, ((LUNCH_BREAK_END_MINUTES - LUNCH_BREAK_START_MINUTES) / 60) * HOUR_HEIGHT),
                          }}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-wide text-black">
                            Lunch break (12:00 PM – 1:00 PM)
                          </span>
                        </div>
                        {(slotsByDay.get(day) ?? []).map((slot) => (
                          <PlacedBlock
                            key={slot.id}
                            slot={slot}
                            justPlaced={flashIds.includes(slot.id)}
                            dimmed={isDimmed(slot.faculty_id, slot.section_id)}
                            dragging={
                              activeDrag?.type === 'move' && activeDrag.slot.id === slot.id
                            }
                            reducedMotion={Boolean(reduce)}
                            onFlashComplete={() => clearFlash(slot.id)}
                            onRemove={() => setDeletingSlot(slot)}
                            onInspect={() => setInspectedSlotId(slot.id)}
                          />
                        ))}
                        {/* Ghost landing preview (Option A): a translucent copy
                            of the block being dragged, parked exactly where it
                            would land in THIS day column — sized to the real
                            placement height and painted in the class's own
                            color. Replaces the old green cell tint so the
                            landing feedback reads like a calendar app, not
                            FlowSched. */}
                        {ghostPreview && ghostPreview.day === day ? (
                          <div
                            aria-hidden="true"
                            data-ghost-preview="true"
                            className="pointer-events-none absolute left-1 right-1 z-20 overflow-hidden rounded-md ring-2 ring-inset ring-leaf-700/60"
                            style={{
                              top: ghostPreview.top,
                              height: ghostPreview.height,
                              backgroundColor: ghostPreview.color,
                              opacity: 0.55,
                              color: ghostPreview.text,
                            }}
                          >
                            <p className="truncate px-2.5 pt-2 text-xs font-semibold">
                              {ghostPreview.title}
                            </p>
                            {ghostPreview.height >= 44 ? (
                              <p className="truncate px-2.5 text-[11px] opacity-80">
                                {ghostPreview.subtitle}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Floating clone that follows the pointer/keyboard focus smoothly.
              Its height matches the duration that will actually be placed.
              It is deliberately translucent and outline-only: the whole point of
              a drag is to line the block up against the grid, so an opaque card
              would hide the very cells you are trying to aim at. The dashed
              ring keeps the block's extent readable against the lines showing
              through it. */}
          <DragOverlay dropAnimation={reduce ? null : { duration: 180, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
            {activeDrag ? (
              <div className="relative">
                <div
                  className="w-56 cursor-grabbing opacity-60"
                  style={{ height: overlayHeight(activeDrag) }}
                >
                  <AssignmentCardBody
                    title={
                      activeDrag.type === 'new'
                        ? `${activeDrag.assignment.subject_code} — ${chunkSessionBadge(activeDrag.sessionType)}`
                        : activeDrag.slot.subject_code
                    }
                    subtitle={
                      overlayHeight(activeDrag) >= 56
                        ? activeDrag.type === 'new'
                          ? `${activeDrag.assignment.section_label} · ${activeDrag.assignment.faculty_name}`
                          : `${activeDrag.slot.section_label} · ${activeDrag.slot.faculty_name}`
                        : undefined
                    }
                    meta={
                      activeDrag.type === 'new'
                        ? `${formatHours(activeDrag.duration)}h · ${chunkSessionBadge(activeDrag.sessionType)}`
                        : `${DAY_LABELS[activeDrag.slot.day_of_week]} ${formatTime12h(activeDrag.slot.start_time)}–${formatTime12h(activeDrag.slot.end_time)}`
                    }
                    // The assignment's own color is kept: the wrapper's opacity
                    // makes it translucent, so the hue still identifies the class
                    // while the grid shows through it.
                    className="flex h-full flex-col justify-center border-2 border-dashed border-leaf-700 shadow-lg"
                    color={
                      activeDrag.type === 'new' ? activeDrag.assignment.color : activeDrag.slot.color
                    }
                  />
                </div>
                <DragDetailsCard info={activeDrag} onLeft={detailsOnLeft} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {override ? (
        <OverrideDialog
          state={override}
          reason={overrideReason}
          busy={overrideBusy}
          onReasonChange={setOverrideReason}
          onConfirm={() => void handleOverrideConfirm()}
          onClose={() => setOverride(null)}
        />
      ) : null}

      {inspectedSlot ? (
        <BlockDetailsDialog
          info={{ type: 'move', slot: inspectedSlot }}
          onClose={() => setInspectedSlotId(null)}
        />
      ) : null}

      <ConfirmDialog
        open={deletingSlot !== null}
        title="Remove scheduled class?"
        message={
          deletingSlot
            ? `${deletingSlot.subject_code} (${DAY_LABELS[deletingSlot.day_of_week]} ${formatTime12h(deletingSlot.start_time)}–${formatTime12h(deletingSlot.end_time)}) will be removed from the grid. The workload assignment stays in the sidebar.`
            : ''
        }
        confirmLabel="Remove"
        pending={deleteBusy}
        onConfirm={() => void handleDeleteSlot()}
        onCancel={() => setDeletingSlot(null)}
      />

      <Modal
        open={resetOpen}
        title="Reset schedule"
        onClose={() => {
          if (!resetBusy) {
            setResetOpen(false);
            setResetPassword('');
            setResetError(null);
          }
        }}
      >
        <form onSubmit={handleResetSchedule} className="space-y-4">
          <p className="text-sm text-slate-700">
            Clear placed classes for {term ? term.label : 'this term'}. Assignments stay —
            everything returns to Unassigned classes.
          </p>
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Scope
            </legend>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="reset-scope"
                value="all"
                checked={resetScope === 'all'}
                onChange={() => setResetScope('all')}
              />
              Reset all — every placed class this term
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="reset-scope"
                value="faculty"
                checked={resetScope === 'faculty'}
                onChange={() => setResetScope('faculty')}
                disabled={!filterFacultyId}
              />
              This faculty member
              {filterFacultyId
                ? ` (${faculty.find((m) => m.id === filterFacultyId)?.last_name ?? ''})`
                : ' — pick one in the Faculty filter'}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="reset-scope"
                value="room"
                checked={resetScope === 'room'}
                onChange={() => setResetScope('room')}
                disabled={!selectedRoomId}
              />
              This room
              {selectedRoom ? ` (${selectedRoom.name})` : ' — select a room first'}
            </label>
          </fieldset>
          <div>
            <label htmlFor="reset-password" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Confirm with your account password
            </label>
            <input
              id="reset-password"
              type="password"
              autoComplete="current-password"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
              placeholder="Chair account password"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
            />
          </div>
          {resetError ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {resetError}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                if (!resetBusy) {
                  setResetOpen(false);
                  setResetPassword('');
                  setResetError(null);
                }
              }}
              disabled={resetBusy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={resetBusy}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {resetBusy ? 'Resetting…' : 'Reset schedule'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

/**
 * One droppable half-hour cell. The FlowSched green tint + inset ring that
 * used to mark the drop target is gone (Option A): the landing feedback is now
 * the translucent ghost block (`ghostPreview`), not a tint on the cells, so
 * these stay visually neutral — just the grid. `data-drop-preview` is kept on
 * the spanned cells so the multi-cell duration preview is still assertable.
 */
function DropCell({ id, highlighted = false, disabled = false }: { id: string; highlighted?: boolean; disabled?: boolean }): JSX.Element {
  const { setNodeRef } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      data-drop-id={id}
      // Exposed so tests can assert the multi-cell preview without class names.
      data-drop-preview={highlighted ? 'true' : undefined}
      data-lunch-blocked={disabled ? 'true' : undefined}
      className="cu-cell border-b border-black bg-white"
      style={{ height: HALF_HOUR_HEIGHT }}
    />
  );
}

/**
 * The detail rows shown for a drag, whichever thing is being dragged.
 *
 * Extracted (and exported) so the drag overlay card and the click-to-inspect
 * popup render from exactly one definition — they must never drift apart.
 *
 * Deliberately does NOT repeat the "duration · session" meta line for a new
 * chunk: that text is already printed on the dragged block itself, and
 * duplicating it makes the card read as a copy rather than a detail view.
 */
export function detailRowsFor(info: DragInfo): { label: string; value: string }[] {
  if (info.type === 'new') {
    return [
      { label: 'Subject', value: info.assignment.subject_title },
      { label: 'Section', value: info.assignment.section_label },
      { label: 'Faculty', value: info.assignment.faculty_name },
      { label: 'Units', value: String(info.assignment.subject_units) },
      { label: 'Placing', value: formatHours(info.duration) },
      {
        label: 'Left after',
        value: `${formatHours(Math.max(0, info.remaining - info.duration))}h`,
      },
    ];
  }
  return [
    { label: 'Subject', value: info.slot.subject_title },
    { label: 'Section', value: info.slot.section_label },
    { label: 'Faculty', value: info.slot.faculty_name },
    { label: 'Room', value: info.slot.room_name ?? 'TBA' },
    { label: 'Units', value: String(info.slot.subject_units) },
    {
      label: 'When',
      value: `${DAY_LABELS[info.slot.day_of_week]} ${formatTime12h(info.slot.start_time)}–${formatTime12h(info.slot.end_time)}`,
    },
    {
      label: 'Session',
      value: `${chunkSessionBadge(info.slot.session_type)} · ${formatHours(info.slot.session_hours)}h`,
    },
  ];
}

/** The block's custom color, or null when it uses the default leaf card. */
function detailAccentFor(info: DragInfo): string | null {
  const custom = info.type === 'new' ? info.assignment.color : info.slot.color;
  return custom && HEX_COLOR_PATTERN.test(custom) ? custom : null;
}

/** Subject code shown in the details header. */
function detailCodeFor(info: DragInfo): string {
  return info.type === 'new' ? info.assignment.subject_code : info.slot.subject_code;
}

/**
 * Field label + value row inside a details card. The label adopts the
 * assignment color's readable text color context via the card header, and the
 * value is the part that must stay legible at a glance.
 */
function DragDetailRow({
  label,
  value,
  compact,
}: {
  label: string;
  value: string;
  /** True in the cursor-following drag card, which must stay small. */
  compact: boolean;
}): JSX.Element {
  return (
    <div
      className={`flex items-baseline justify-between ${compact ? 'gap-4 py-[3px]' : 'gap-6 py-2'}`}
    >
      <span
        className={`shrink-0 font-medium uppercase tracking-wider opacity-70 ${
          compact ? 'text-[10px]' : 'text-xs'
        }`}
      >
        {label}
      </span>
      <span
        className={`truncate font-semibold ${compact ? 'text-xs' : 'text-sm'}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * The expanded details card shown while a block is being dragged.
 *
 * Rendered inside `DragOverlay` so it travels with the block under the cursor.
 * It reuses the block's own color (and its matching readable text color) as the
 * header, so the popup reads as "the same class, un-folded" rather than a
 * foreign dialog — the color structure the block already established is carried
 * straight through.
 *
 * `pointer-events-none` is essential: dnd-kit tracks the pointer on the
 * overlay, and a real hit target under the cursor would swallow the drag.
 */
function DragDetailsCard({
  info,
  onLeft = false,
}: {
  info: DragInfo;
  /** Open to the left of the cursor instead of the right (viewport edge). */
  onLeft?: boolean;
}): JSX.Element {
  return (
    <div
      className={`pointer-events-none absolute top-0 ${onLeft ? 'right-[calc(100%+14px)]' : 'left-[calc(100%+14px)]'}`}
    >
      <DetailsCard info={info} />
    </div>
  );
}

/**
 * The details card itself — colored header in the block's own color, then the
 * shared detail rows. Shared by the drag overlay and the click-to-inspect popup
 * so both always show exactly the same fields in the same style.
 */
/**
 * The details card itself — colored header in the block's own color, then the
 * shared detail rows. Shared by the drag overlay and the click-to-inspect popup
 * so both always show exactly the same fields in the same style.
 *
 * `compact` is for the cursor-following drag card, which must stay small so it
 * does not cover the very grid cells being aimed at. The click popup renders
 * full size, where there is no such pressure and the values deserve room.
 */
function DetailsCard({ info, compact = true }: { info: DragInfo; compact?: boolean }): JSX.Element {
  const accent = detailAccentFor(info);
  const headerText = accent ? readableTextColor(accent) : '#10241A';
  const rows = detailRowsFor(info);
  return (
    <div
      className={`overflow-hidden bg-white/85 backdrop-blur-md ${
        compact
          ? 'w-64 rounded-xl border border-leaf-200 shadow-[0_18px_40px_-12px_rgba(16,36,26,0.4)]'
          : 'w-full rounded-none'
      }`}
    >
      {/* Header band in the block's own color, mirroring the block's own
          color structure so the two read as one object. */}
      <div
        className={`flex items-center gap-2 ${compact ? 'px-3 py-2' : 'px-5 py-3.5'}`}
        style={accent ? { backgroundColor: accent, color: headerText } : undefined}
      >
        <span
          className={`shrink-0 rounded-full bg-current opacity-70 ${
            compact ? 'h-2 w-2' : 'h-2.5 w-2.5'
          }`}
          aria-hidden="true"
        />
        <span className={`truncate font-bold ${compact ? 'text-sm' : 'text-lg'}`}>
          {detailCodeFor(info)}
        </span>
        <span
          className={`ml-auto shrink-0 font-semibold uppercase tracking-wide opacity-80 ${
            compact ? 'text-[10px]' : 'text-xs'
          }`}
        >
          Details
        </span>
      </div>
      <div className={`divide-y divide-leaf-100/70 ${compact ? 'px-3 py-1.5' : 'px-5 py-2.5'}`}>
        {rows.map((row) => (
          <DragDetailRow key={row.label} label={row.label} value={row.value} compact={compact} />
        ))}
      </div>
    </div>
  );
}

/**
 * Click-to-inspect popup for a block already placed on the grid.
 *
 * Opened by clicking a placed block, so the full record is readable without
 * having to pick it up and drag it. Renders the same `DetailsCard` as the drag
 * overlay — same color structure, same fields — so the two are visually one
 * feature. Dismissed by Escape, the backdrop, or the close button.
 */
function BlockDetailsDialog({
  info,
  onClose,
}: {
  info: DragInfo;
  onClose: () => void;
}): JSX.Element {
  const reduce = useReducedMotion();
  const transition = reduce ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' as const };

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onMouseDown={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transition}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`${detailCodeFor(info)} details`}
        className="relative z-10 w-[30rem] max-w-full overflow-hidden rounded-2xl bg-white/95 shadow-[0_30px_70px_-20px_rgba(16,36,26,0.45)] backdrop-blur-md"
        initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 8 }}
        transition={transition}
      >
        {/* The shared card supplies the color header and the field rows; the
            close control rides in the same band so the color block stays intact. */}
        <div className="relative">
          <DetailsCard info={info} compact={false} />
          <button
            type="button"
            aria-label="Close details"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg bg-black/15 text-current transition-colors hover:bg-black/25"
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/** Shared visual body for sidebar cards, placed blocks, and the drag overlay. */
function AssignmentCardBody({
  title,
  subtitle,
  meta,
  className = '',
  color = null,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  className?: string;
  /** Custom assignment color (Part 3). Null renders the default leaf card. */
  color?: string | null;
}): JSX.Element {
  const custom = color && HEX_COLOR_PATTERN.test(color) ? color : null;
  const text = custom ? readableTextColor(custom) : null;
  return (
    <div
      className={`overflow-hidden rounded-lg border p-2.5 shadow-sm ${className} ${
        custom ? '' : 'border-leaf-200 bg-white'
      }`}
      style={custom ? { backgroundColor: custom, borderColor: custom, color: text ?? undefined } : undefined}
    >
      <p className={`truncate text-xs font-semibold ${custom ? '' : 'text-ink'}`}>{title}</p>
      {subtitle ? (
        <p className={`truncate text-[11px] ${custom ? 'opacity-75' : 'text-ink/60'}`}>{subtitle}</p>
      ) : null}
      {meta ? (
        <p className={`mt-0.5 truncate text-[11px] font-medium ${custom ? 'opacity-80' : 'text-leaf-700'}`}>{meta}</p>
      ) : null}
    </div>
  );
}

/**
 * Sidebar card for one (assignment, session type) chunk with hours left.
 * Carries a duration picker: the Chair can place part of the remaining hours
 * now (e.g. 1.5 of 3 lab hours) and drop the rest somewhere else later.
 * Also carries the color swatch (Part 3): picking a preset recolors both this
 * card's marker and every already-placed block of the assignment, live.
 */
function UnassignedCard({
  assignment,
  sessionType,
  remaining,
  dimmed,
  dragging,
  onColorChange,
}: {
  assignment: WorkloadAssignment;
  sessionType: SessionType;
  remaining: number;
  dimmed: boolean;
  dragging: boolean;
  onColorChange: (assignmentId: string, hex: string) => void;
}): JSX.Element {
  const chunkId = `${assignment.id}:${sessionType}`;
  // Single-meeting cap for this session type (LECTURE ≤ 2h, LAB ≤ 3h): the
  // picker never offers more than one block's worth — the leftover weekly
  // budget becomes a second block once this one is placed.
  const cap = blockCapFor(sessionType);
  // Defaults to one meeting's worth of the remaining hours; the Chair can
  // shave it down before dragging (0.5h steps). A 0 value marks
  // "invalid — dragging disabled".
  const [duration, setDuration] = useState(() => defaultChunkHours(remaining, sessionType));
  const [note, setNote] = useState<string | null>(null);

  // After a placement (or a slot removal) the remaining budget changes —
  // re-point the picker at it so the card always offers what's placeable.
  useEffect(() => {
    setDuration(defaultChunkHours(remaining, sessionType));
  }, [remaining, sessionType]);

  const valid = isChunkDurationValid(duration, remaining, cap);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `assignment:${chunkId}`,
    disabled: !valid,
    data: {
      type: 'new',
      chunkId,
      assignment,
      sessionType,
      remaining,
      duration,
    } as DragInfo,
  });

  return (
    <div
      ref={setNodeRef}
      data-chunk-id={chunkId}
      data-chunk-duration={duration}
      // Card-level drag state, surfaced on the root so the whole card reads as
      // "not draggable" while the picker holds the invalid 0 marker.
      aria-disabled={!valid}
      className={`relative transition-all duration-150 ${dragging ? 'opacity-40 grayscale-[30%]' : ''} ${
        dimmed ? 'opacity-20' : ''
      } ${isDragging ? 'opacity-0' : ''}`}
    >
      <ColorSwatchPicker assignmentId={assignment.id} color={assignment.color} onColorChange={onColorChange} />
      {/* Drag handle = the card body; the picker below stays clickable. */}
      <div
        {...(valid ? { ...listeners, ...attributes } : {})}
        aria-disabled={!valid}
        title={
          valid
            ? 'Drag onto the grid, or Tab here and press Space'
            : 'Set a duration of at least 0.5h to enable dragging'
        }
        className={`touch-none select-none ${valid ? 'cursor-grab' : 'cursor-not-allowed'}`}
      >
        <AssignmentCardBody
          title={`${assignment.subject_code} — ${chunkSessionBadge(sessionType)}`}
          subtitle={`${assignment.section_label} · ${assignment.faculty_name}`}
          meta={`${formatHours(duration)}h selected · ${formatHours(remaining)}h remaining`}
        />
      </div>
      <DurationPicker
        value={duration}
        remaining={remaining}
        cap={cap}
        note={note}
        onStep={(delta) => {
          setNote(null);
          setDuration((current) => stepChunkHours(current, delta, remaining, cap));
        }}
        onCommit={(raw) => {
          const parsed = Number(raw);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            setDuration(0);
            setNote(
              `Enter at least ${formatHours(Math.min(MIN_CHUNK_HOURS, remaining))}h to place this block.`,
            );
            return;
          }
          const clamped = clampChunkHours(parsed, remaining, cap);
          setDuration(clamped);
          setNote(
            clamped < parsed
              ? remaining <= cap
                ? `Only ${formatHours(remaining)}h remaining.`
                : `One ${chunkSessionBadge(sessionType)} block holds at most ${formatHours(cap)}h.`
              : null,
          );
        }}
      />
    </div>
  );
}

/**
 * Small color dot on the card's corner (Part 3). Opens a preset palette
 * popover; selecting a preset calls the PATCH-backed onColorChange, outside
 * click and Escape close it. Shows the assignment's current (or default) color.
 */
function ColorSwatchPicker({
  assignmentId,
  color,
  onColorChange,
}: {
  assignmentId: string;
  color: string | null;
  onColorChange: (assignmentId: string, hex: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = assignmentColor({ color });

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="absolute -right-1 -top-1 z-20" data-color-picker={assignmentId}>
      <button
        type="button"
        aria-label={`Change color (${current})`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Change color"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="block h-5 w-5 cursor-pointer rounded-full border-2 border-white shadow-sm ring-1 ring-leaf-300 transition-transform hover:scale-110"
        style={{ backgroundColor: current }}
      />
      {open ? (
        <div
          role="menu"
          aria-label="Pick a color"
          className="absolute right-0 top-6 w-36 rounded-xl border border-leaf-100 bg-white p-2 shadow-lg"
        >
          <div className="grid grid-cols-3 gap-1.5">
            {COLOR_PRESETS.map((preset) => {
              const selected = current.toUpperCase() === preset.hex.toUpperCase();
              return (
                <button
                  key={preset.hex}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  aria-label={`${preset.label} color`}
                  title={preset.label}
                  onClick={(event) => {
                    event.stopPropagation();
                    onColorChange(assignmentId, preset.hex);
                    setOpen(false);
                  }}
                  className={`h-7 w-7 cursor-pointer rounded-full border-2 transition-transform hover:scale-110 ${
                    selected ? 'border-ink' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: preset.hex }}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * − / hours / + stepper for a chunk card's placeable duration (0.5h steps).
 * The number field commits on blur or Enter; an over-remaining (or over-cap)
 * entry clamps with an inline note; 0/negative leaves the card undraggable
 * until fixed.
 */
function DurationPicker({
  value,
  remaining,
  cap,
  note,
  onStep,
  onCommit,
}: {
  value: number;
  remaining: number;
  /** Single-meeting cap for the card's session type (LEC ≤ 2h, LAB ≤ 3h). */
  cap: number;
  note: string | null;
  onStep: (delta: number) => void;
  onCommit: (raw: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatHours(value);
  // The + button stops at whichever is tighter: what's left this week, or one
  // meeting's worth.
  const limit = Math.min(remaining, cap);
  const atMin = value <= Math.min(MIN_CHUNK_HOURS, remaining) + 1e-9;
  const atMax = value >= limit - 1e-9;
  const commit = (): void => {
    if (draft === null) {
      return;
    }
    onCommit(draft);
    setDraft(null);
  };
  const stepperBtn =
    'h-6 w-6 rounded-md border border-leaf-200 text-sm font-semibold leading-none text-leaf-700 transition-colors enabled:hover:border-leaf-400 enabled:hover:bg-leaf-50 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="mt-1.5">
      <div
        role="group"
        aria-label={`Hours to place (up to ${formatHours(limit)}h ${
          limit < remaining ? 'per block' : 'remaining'
        })`}
        className="flex items-center gap-1.5"
      >
        <button
          type="button"
          aria-label="Fewer hours"
          disabled={atMin}
          onClick={() => onStep(-1)}
          className={stepperBtn}
        >
          −
        </button>
        <input
          aria-label="Hours to place"
          inputMode="decimal"
          value={shown}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
          }}
          className="w-12 rounded-md border border-leaf-200 bg-white px-1.5 py-1 text-center text-xs font-semibold text-ink outline-none transition-colors focus:border-leaf-500 focus:ring-4 focus:ring-leaf-500/15"
        />
        <button
          type="button"
          aria-label="More hours"
          disabled={atMax}
          onClick={() => onStep(1)}
          className={stepperBtn}
        >
          +
        </button>
        <span className="text-[11px] text-ink/50">hours per block</span>
      </div>
      {note ? (
        <p role="status" className="mt-1 text-[11px] font-medium text-amber-600">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** Placed ScheduleSlot block — draggable to move, spring-animates on entry. */
function PlacedBlock({
  slot,
  justPlaced,
  dimmed,
  dragging,
  reducedMotion,
  onFlashComplete,
  onRemove,
  onInspect,
}: {
  slot: ScheduleSlot;
  justPlaced: boolean;
  dimmed: boolean;
  dragging: boolean;
  reducedMotion: boolean;
  onFlashComplete: () => void;
  onRemove: () => void;
  /** Click-to-inspect: open the full record for this block. */
  onInspect: () => void;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `slot:${slot.id}`,
    data: { type: 'move', slot } as DragInfo,
  });
  const start = timeToMinutes(slot.start_time);
  const end = timeToMinutes(slot.end_time);
  // dnd-kit's PointerSensor only starts a drag after 4px of movement, so a
  // genuine click (press and release in place) still fires onClick. Guarding on
  // `isDragging` is what keeps the click that follows a real drag — the pointer
  // is released at the end of every drag — from also opening the dialog.
  function handleInspect(): void {
    if (isDragging) {
      return;
    }
    onInspect();
  }
  const entrance = reducedMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, scale: 0.9, y: -6 },
        animate: { opacity: 1, scale: 1, y: 0 },
        transition: { type: 'spring' as const, stiffness: 500, damping: 30 },
      };
  return (
    <motion.div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      layout={!reducedMotion}
      initial={entrance.initial}
      animate={entrance.animate}
      {...(reducedMotion ? {} : { transition: entrance.transition })}
      onAnimationComplete={() => {
        if (justPlaced) {
          onFlashComplete();
        }
      }}
      aria-roledescription="Scheduled class. Click for details, or press space or enter to pick up and move it."
      aria-label={`${slot.subject_code}, ${slot.section_label}, ${slot.faculty_name}, ${DAY_LABELS[slot.day_of_week]} ${formatTime12h(slot.start_time)} to ${formatTime12h(slot.end_time)}`}
      onClick={handleInspect}
      className={`cu-block absolute left-0.5 right-0.5 z-10 cursor-grab touch-none select-none overflow-hidden rounded-[2px] border border-black transition-opacity duration-200 ${
        dragging ? 'opacity-40 grayscale-[30%]' : dimmed ? 'opacity-20' : ''
      } ${isDragging ? 'opacity-0' : ''}`}
      style={{ top: slotTop(start), height: slotHeight(start, end) }}
    >
      <AssignmentCardBody
        title={slot.subject_title || slot.subject_code}
        subtitle={`${slot.section_label} · ${slot.faculty_name}`}
        meta={`${formatTime12h(slot.start_time)}–${formatTime12h(slot.end_time)}`}
        className={`cu-block-body h-full ${slot.color ? '' : 'border-black bg-[#E4DFEC]'}`}
        color={slot.color}
      />
      <button
        type="button"
        aria-label={`Remove ${slot.subject_code} from the grid`}
        onClick={(event) => {
          // Keep the remove click from also opening the details dialog.
          event.stopPropagation();
          onRemove();
        }}
        className="absolute bottom-0.5 right-0.5 hidden rounded px-1 text-[10px] font-bold text-ink/40 hover:bg-white/70 hover:text-red-600 sm:block"
      >
        ×
      </button>
    </motion.div>
  );
}


/** Exported for direct render tests of the 409 → override flow. */
export function OverrideDialog({
  state,
  reason,
  busy,
  onReasonChange,
  onConfirm,
  onClose,
}: {
  state: OverrideState;
  reason: string;
  busy: boolean;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <Modal open title={CONFLICT_LABELS[state.code]} onClose={onClose}>
      <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-semibold">{CONFLICT_LABELS[state.code]}</p>
        <p className="mt-0.5">{state.message}</p>
        <ConflictDetailsList details={state.details} />
      </div>
      <p className="mt-4 text-sm text-slate-600">
        You can still place this class — the conflict is logged as an explicit Chair override.
      </p>
      <label htmlFor="override-reason" className="mb-1.5 mt-3 block text-xs font-semibold text-ink/70">
        Reason (optional, recorded in the audit log)
      </label>
      <input
        id="override-reason"
        type="text"
        value={reason}
        onChange={(event) => onReasonChange(event.target.value)}
        placeholder="e.g. Approved by the department head"
        className="w-full rounded-xl border-[1.5px] border-leaf-100 bg-white/80 px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-leaf-500 focus:bg-white focus:ring-4 focus:ring-leaf-500/15"
      />
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:scale-[1.02] enabled:hover:bg-amber-600 disabled:opacity-60"
        >
          {busy ? 'Placing…' : 'Place anyway'}
        </button>
      </div>
    </Modal>
  );
}

/** Renders the structured 409 details (what is already booked in that window). */
export function ConflictDetailsList({ details }: { details: ConflictDetails | null }): JSX.Element | null {
  if (!details || details.conflicting_slots.length === 0) {
    return null;
  }
  return (
    <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs">
      {details.conflicting_slots.map((conflict) => (
        <li key={conflict.slot_id}>
          <span className="font-medium">
            {DAY_LABELS[conflict.day_of_week]} {formatTime12h(conflict.start_time)}–
            {formatTime12h(conflict.end_time)}:
          </span>{' '}
          {conflict.subject_code} · {conflict.section_label} · {conflict.faculty_name}
          {conflict.room_name ? ` · ${conflict.room_name}` : ''}
        </li>
      ))}
    </ul>
  );
}

