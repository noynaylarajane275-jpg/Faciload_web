import { apiFetch } from './api';

export interface Room {
  id: string;
  name: string;
  is_under_maintenance: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoomListResult {
  data: Room[];
  meta: { total: number };
}

export interface RoomInput {
  name: string;
  is_under_maintenance?: boolean;
}

export function listRooms(query: { search?: string } = {}): Promise<RoomListResult> {
  const params = new URLSearchParams();
  if (query.search) {
    params.set('search', query.search);
  }
  const qs = params.toString();
  return apiFetch<RoomListResult>(`/api/rooms${qs ? `?${qs}` : ''}`);
}

export function createRoom(input: RoomInput): Promise<{ room: Room }> {
  return apiFetch<{ room: Room }>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * PATCH is used for the fast maintenance toggle: sending only
 * `{ is_under_maintenance }` keeps the toggle a single round-trip with no
 * read-modify-write of the room's name.
 */
export function updateRoom(id: string, input: Partial<RoomInput>): Promise<{ room: Room }> {
  return apiFetch<{ room: Room }>(`/api/rooms/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}