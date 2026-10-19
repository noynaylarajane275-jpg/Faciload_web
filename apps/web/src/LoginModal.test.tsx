import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginModal } from './components/auth/LoginModal';
import { RequireAuth } from './components/RequireAuth';
import { useUiStore } from './store/ui.store';
import { useAuthStore } from './store/auth.store';
import { loginRequest } from './lib/api';

vi.mock('./lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./lib/api')>();
  return { ...orig, loginRequest: vi.fn() };
});

const mockLogin = loginRequest as unknown as ReturnType<typeof vi.fn>;

function renderModalAt(path = '/'): void {
  useUiStore.getState().openLoginModal();
  render(
    <MemoryRouter initialEntries={[path]}>
      <LoginModal />
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
        <Route path="/workload" element={<div>My workload page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockLogin.mockReset();
  useAuthStore.getState().logout();
  useUiStore.getState().closeLoginModal();
  document.body.style.overflow = '';
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  useUiStore.getState().closeLoginModal();
  document.body.style.overflow = '';
});

describe('LoginModal', () => {
  it('renders the Welcome back title with email + password fields', () => {
    renderModalAt();
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('shows client-side validation errors for a bad email', async () => {
    renderModalAt();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'something' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('keeps an inline error path available (server failure surfaces alert)', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid email or password'));
    renderModalAt();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'chair.dev@faciload.local' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
    expect((screen.getByLabelText(/email/i) as HTMLInputElement).value).toBe('chair.dev@faciload.local');
  });
  it('redirects to /dashboard on successful login', async () => {
    mockLogin.mockResolvedValueOnce({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', email: 'c@x.local', role: 'CHAIR', facultyId: null },
    });
    renderModalAt();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'c@x.local' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText('Dashboard page')).toBeInTheDocument());
  });

  it('redirects FACULTY logins to their own workload', async () => {
    mockLogin.mockResolvedValueOnce({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u', email: 'f@x.local', role: 'FACULTY', facultyId: 'fac-1' },
    });
    renderModalAt();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'f@x.local' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText('My workload page')).toBeInTheDocument());
  });
});


describe('RequireAuth route guard', () => {
  function renderAt(path: string): void {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<div>Login page</div>} />
          <Route path="/not-authorized" element={<div>Not authorized</div>} />
          <Route
            path="/reports"
            element={
              <RequireAuth allowedRoles={['CHAIR', 'ACADEMIC_ADMIN']}>
                <div>Reports page</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('redirects unauthenticated users to /login', () => {
    renderAt('/reports');
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('redirects wrong role to /not-authorized', () => {
    useAuthStore.getState().login({
      user: { id: 'u', email: 'f@x.local', role: 'FACULTY', facultyId: null },
      accessToken: 'a',
      refreshToken: 'r',
    });
    renderAt('/reports');
    expect(screen.getByText('Not authorized')).toBeInTheDocument();
  });

  it('allows correct role', () => {
    useAuthStore.getState().login({
      user: { id: 'u', email: 'a@x.local', role: 'ACADEMIC_ADMIN', facultyId: null },
      accessToken: 'a',
      refreshToken: 'r',
    });
    renderAt('/reports');
    expect(screen.getByText('Reports page')).toBeInTheDocument();
  });
});
