/**
 * Rooms page UI tests (testing.md §4: forms, validation, loading/error states,
 * role-based controls, no-refresh behavior).
 *
 * Regression note: the create/rename <Modal> was once missing from this
 * page's render tree entirely — "+ Add room" and "Rename" flipped state that
 * nothing displayed, so the buttons looked dead. These tests fail if the
 * dialog ever disappears again.
 */
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/Toast';
import { createRoom, listRooms, updateRoom } from '../lib/rooms';
import type { Room } from '../lib/rooms';
import { useAuthStore, type AuthRole } from '../store/auth.store';
import { RoomsPage } from './RoomsPage';

vi.mock('../lib/rooms', () => ({
  listRooms: vi.fn(),
  createRoom: vi.fn(),
  updateRoom: vi.fn(),
}));

const listRoomsMock = vi.mocked(listRooms);
const createRoomMock = vi.mocked(createRoom);
const updateRoomMock = vi.mocked(updateRoom);

const ROOM_A: Room = {
  id: 'a-uuid',
  name: 'IE Lab 1',
  is_under_maintenance: false,
  created_at: '2026-09-14T00:00:00.000Z',
  updated_at: '2026-09-14T00:00:00.000Z',
};

const ROOM_B: Room = {
  id: 'b-uuid',
  name: 'Room 301',
  is_under_maintenance: true,
  created_at: '2026-09-14T00:00:00.000Z',
  updated_at: '2026-09-14T00:00:00.000Z',
};

const LIST_OK = { data: [ROOM_A, ROOM_B], meta: { total: 2 } };
const LIST_EMPTY = { data: [], meta: { total: 0 } };

function setRole(role: AuthRole): void {
  useAuthStore.setState({
    user: { id: 'u-1', email: 'user@faciload.local', role, facultyId: null },
    isAuthenticated: true,
    accessToken: 'test-access-token',
  });
}

function renderPage(): void {
  render(
    <ToastProvider>
      <RoomsPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setRole('CHAIR');
  listRoomsMock.mockResolvedValue(LIST_OK);
  createRoomMock.mockResolvedValue({ room: ROOM_A });
  updateRoomMock.mockResolvedValue({ room: ROOM_A });
});

afterEach(() => {
  cleanup();
});

describe('RoomsPage — list rendering', () => {
  it('renders rooms from the API', async () => {
    renderPage();
    expect(await screen.findByText('IE Lab 1')).toBeInTheDocument();
    expect(screen.getByText('Room 301')).toBeInTheDocument();
    // Room 301 is under maintenance — badge renders from server state.
    expect(screen.getByText('Under maintenance')).toBeInTheDocument();
    expect(listRoomsMock).toHaveBeenCalledWith({});
  });

  it('shows the empty state with a create shortcut', async () => {
    listRoomsMock.mockResolvedValue(LIST_EMPTY);
    renderPage();
    expect(await screen.findByText('No rooms yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add the first room' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows the error state and retries via the Retry button', async () => {
    listRoomsMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(LIST_OK);
    renderPage();
    expect(await screen.findByText('Could not load rooms.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('IE Lab 1')).toBeInTheDocument();
    expect(listRoomsMock).toHaveBeenCalledTimes(2);
  });
});

describe('RoomsPage — create', () => {
  it('opens the dialog from "+ Add room" and creates a room without a reload', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '+ Add room' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Add Room');

    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'IE Lab 9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(createRoomMock).toHaveBeenCalledWith({ name: 'IE Lab 9' }));
    expect(await screen.findByText('Room added.')).toBeInTheDocument();
    // Dialog closes and the list refreshes from the server.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(listRoomsMock).toHaveBeenCalledTimes(2);
  });

  it('shows inline validation for a blank name and does not call the API', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '+ Add room' }));
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Room name is required')).toBeInTheDocument();
    expect(createRoomMock).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and shows the server error for a duplicate name', async () => {
    createRoomMock.mockRejectedValue(new Error('Room "IE Lab 1" already exists'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '+ Add room' }));
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'IE Lab 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('RoomsPage — rename', () => {
  it('pre-fills the dialog and saves the new name in place', async () => {
    renderPage();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Rename' }))[0] as HTMLElement);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Edit Room');
    const input = screen.getByLabelText('Room name') as HTMLInputElement;
    expect(input.value).toBe('IE Lab 1');

    fireEvent.change(input, { target: { value: 'IE Lab A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateRoomMock).toHaveBeenCalledWith('a-uuid', { name: 'IE Lab A' }));
    expect(await screen.findByText('Room saved.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('RoomsPage — maintenance toggle', () => {
  it('flips the switch and PATCHes only the maintenance flag', async () => {
    // The API echoes the updated room — simulate the flag landing server-side.
    updateRoomMock.mockResolvedValue({ room: { ...ROOM_A, is_under_maintenance: true } });
    renderPage();
    const sw = await screen.findByRole('switch', { name: 'Mark IE Lab 1 under maintenance' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    await waitFor(() =>
      expect(updateRoomMock).toHaveBeenCalledWith('a-uuid', { is_under_maintenance: true }),
    );
    expect(await screen.findByText('IE Lab 1 marked under maintenance.')).toBeInTheDocument();
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
  });

  it('rolls the switch back and toasts when the write fails', async () => {
    updateRoomMock.mockRejectedValue(new Error('Server said no'));
    renderPage();
    const sw = await screen.findByRole('switch', { name: 'Mark IE Lab 1 under maintenance' });
    fireEvent.click(sw);
    expect(await screen.findByText('Server said no')).toBeInTheDocument();
    // Optimistic flip reverted — the table never lies about server state.
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'));
    expect(updateRoomMock).toHaveBeenCalledTimes(1);
  });

  it('shows the seeded state for a room already under maintenance', async () => {
    renderPage();
    const sw = await screen.findByRole('switch', { name: 'Mark Room 301 under maintenance' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });
});

describe('RoomsPage — role gating', () => {
  it('shows room management controls to the Academic Admin', async () => {
    setRole('ACADEMIC_ADMIN');
    renderPage();
    expect(await screen.findByText('IE Lab 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add room' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Rename' }).length).toBeGreaterThan(0);
    const sw = screen.getByRole('switch', { name: 'Mark IE Lab 1 under maintenance' });
    expect(sw).toBeEnabled();
  });
});
