import { useCallback, useEffect, useState } from 'react';
import { getRoomsOverview, type RoomsOverview } from '../../lib/schedule-views';
import { selectSelectedTerm, useTermStore } from '../../store/term.store';
import { WeeklyScheduleGrid } from './WeeklyScheduleGrid';
import { NoScheduleEmptyState, TermPicker, ViewErrorState, ViewLoadingState } from './views-common';

/**
 * "Classroom Utilization" — one tab per room, exactly like the workbook's
 * per-room sheets, backed by a single rooms-overview request (no N separate
 * fetches when switching tabs). Read-only: every booking comes from the same
 * ScheduleSlot data the master schedule writes.
 */
export function RoomSchedulePage(): JSX.Element {
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

  const [overview, setOverview] = useState<RoomsOverview | null>(null);
  const [roomId, setRoomId] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadTick, setReloadTick] = useState(0);

  const loadOverview = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await getRoomsOverview(selectedTermId ?? undefined);
      setOverview(res);
      // Keep the current tab when it still exists; otherwise land on the first.
      setRoomId((current) =>
        res.rooms.some((room) => room.room_id === current) ? current : (res.rooms[0]?.room_id ?? ''),
      );
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [selectedTermId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview, reloadTick]);

  const activeRoom = overview?.rooms.find((room) => room.room_id === roomId) ?? null;

  return (
    <section aria-labelledby="room-schedule-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="room-schedule-title" className="text-2xl font-semibold text-primary-dark">
            Room Schedule
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Auto-generated Classroom Utilization — switch rooms like workbook tabs, all from the
            master schedule.
          </p>
        </div>
        <TermPicker />
      </div>

      {status === 'error' ? (
        <ViewErrorState onRetry={() => setReloadTick((tick) => tick + 1)} />
      ) : status === 'loading' ? (
        <ViewLoadingState />
      ) : overview && overview.rooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-leaf-200 bg-white px-4 py-10 text-center">
          <p className="text-sm font-medium text-ink">No rooms yet.</p>
          <p className="mt-1 text-sm text-ink/60">Add rooms on the Rooms page to track their use.</p>
        </div>
      ) : overview && activeRoom ? (
        <div className="space-y-3">
          <div
            role="tablist"
            aria-label="Rooms"
            className="flex flex-wrap gap-1.5 rounded-2xl border border-leaf-100 bg-white p-2 shadow-sm"
          >
            {overview.rooms.map((room) => (
              <button
                key={room.room_id}
                type="button"
                role="tab"
                aria-selected={room.room_id === roomId}
                onClick={() => setRoomId(room.room_id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  room.room_id === roomId
                    ? 'bg-leaf-500 text-white'
                    : 'text-ink/70 transition-colors hover:bg-leaf-50'
                }`}
              >
                {room.room_name}
              </button>
            ))}
          </div>
          {activeRoom.slots.length === 0 ? (
            <NoScheduleEmptyState />
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-ink/60">
                {activeRoom.room_name} · {activeRoom.slots.length}{' '}
                {activeRoom.slots.length === 1 ? 'class' : 'classes'} ·{' '}
                {term ? term.label : 'all terms'}
              </p>
              <WeeklyScheduleGrid slots={activeRoom.slots} variant="room" />
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
