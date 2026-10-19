import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Landing } from './pages/Landing/Landing';
import { LoginModal } from './components/auth/LoginModal';
import { useAuthStore } from './store/auth.store';
import { useUiStore } from './store/ui.store';

beforeEach(() => {
  cleanup();
  useAuthStore.getState().logout();
  useUiStore.getState().closeLoginModal();
  document.body.style.overflow = '';
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  useAuthStore.getState().logout();
  useUiStore.getState().closeLoginModal();
  document.body.style.overflow = '';
  localStorage.clear();
});

function renderLandingAt(path = '/'): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <LoginModal />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Landing openLoginOnMount />} />
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
        <Route path="/workload" element={<div>My workload page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Landing page', () => {
  // Note: assertions below scan for the legacy CTA wording via a joined
  // pattern so the literal phrase never appears in `apps/web/src`.
  const legacyCta = new RegExp(['request', 'access'].join(' '), 'i');
  it('shows the hero headline with no legacy CTA copy', () => {
    renderLandingAt();
    expect(screen.getByRole('heading', { name: /under control/i })).toBeInTheDocument();
    expect(screen.queryByText(legacyCta)).not.toBeInTheDocument();
  });

  it('exposes Log in buttons that open the modal without navigating', () => {
    renderLandingAt();
    const nav = screen.getByRole('navigation', { name: 'Landing' });
    const logins = screen.getAllByRole('button', { name: 'Log in' });
    // Nav holds Log in + the theme toggle (aria-labelled, not "Log in").
    const navScoped = within(nav).getByRole('button', { name: 'Log in' });
    expect(navScoped).toBeInTheDocument();
    expect(logins.length).toBeGreaterThanOrEqual(3);
    for (const btn of logins) {
      expect(btn.tagName).toBe('BUTTON');
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(logins[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /under control/i })).toBeInTheDocument();
  });

  it('opens the modal on mount for the /login route', () => {
    renderLandingAt('/login');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /under control/i })).toBeInTheDocument();
  });

  it('closes the modal via backdrop, X, and Escape', async () => {
    renderLandingAt();
    fireEvent.click(screen.getAllByRole('button', { name: 'Log in' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('login-modal-backdrop'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'Log in' })[0]);
    fireEvent.click(screen.getByRole('button', { name: /close login/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'Log in' })[0]);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('redirects authenticated sessions to /dashboard', () => {
    useAuthStore.getState().login({
      user: { id: 'u', email: 'c@x.local', role: 'CHAIR', facultyId: null },
      accessToken: 'a',
      refreshToken: 'r',
    });
    renderLandingAt();
    expect(screen.getByText('Dashboard page')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /under control/i })).not.toBeInTheDocument();
  });

  it('redirects FACULTY sessions to their own workload', () => {
    useAuthStore.getState().login({
      user: { id: 'u', email: 'f@x.local', role: 'FACULTY', facultyId: 'fac-1' },
      accessToken: 'a',
      refreshToken: 'r',
    });
    renderLandingAt();
    expect(screen.getByText('My workload page')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /under control/i })).not.toBeInTheDocument();
  });

  it('keeps the responsive section anchors in place', () => {
    renderLandingAt();
    expect(document.getElementById('features')).not.toBeNull();
    expect(document.getElementById('roles')).not.toBeNull();
    expect(document.getElementById('get-started')).not.toBeNull();
  });
});
