import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './AppShell';
import { DashboardPage } from '../pages/DashboardPage';
import { useAuthStore } from '../store/auth.store';
import { useUiStore } from '../store/ui.store';

function renderAppAt(path: string, role: 'CHAIR' | 'FACULTY' | 'ACADEMIC_ADMIN'): void {
  useAuthStore.getState().login({
    user: { id: 'u', email: 'user@faciload.local', role, facultyId: null },
    accessToken: 'a',
    refreshToken: 'r',
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell />
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  cleanup();
  useAuthStore.getState().logout();
  useUiStore.getState().closeLoginModal();
  useUiStore.getState().closeSidebar();
});

afterEach(() => {
  cleanup();
  useAuthStore.getState().logout();
  useUiStore.getState().closeLoginModal();
  useUiStore.getState().closeSidebar();
});

describe('AppShell sidebar (role-scoped)', () => {
  it('renders Chair nav items', () => {
    renderAppAt('/dashboard', 'CHAIR');
    const items = [
      'Dashboard', 'Schedule', 'Workload Assignment', 'Faculty', 'Faculty Management', 'Subjects',
      'Rooms', 'Reports', 'My Workload', 'Account Settings',
    ];
    for (const item of items) {
      expect(screen.getByRole('link', { name: item })).toBeInTheDocument();
    }
    expect(screen.getByText(/user@faciload.local/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('renders Faculty nav items only', () => {
    renderAppAt('/dashboard', 'FACULTY');
    for (const item of ['Dashboard', 'Schedule', 'My Workload', 'Account Settings']) {
      expect(screen.getByRole('link', { name: item })).toBeInTheDocument();
    }
    for (const item of ['Workload Assignment', 'Faculty', 'Faculty Management', 'Subjects', 'Rooms', 'Reports']) {
      expect(screen.queryByRole('link', { name: item })).not.toBeInTheDocument();
    }
  });

  it('renders Academic Admin nav items', () => {
    renderAppAt('/dashboard', 'ACADEMIC_ADMIN');
    for (const item of ['Dashboard', 'Schedule', 'Workload Assignment', 'Faculty', 'Faculty Management', 'Subjects', 'Rooms', 'Reports', 'Account Settings']) {
      expect(screen.getByRole('link', { name: item })).toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'My Workload' })).not.toBeInTheDocument();
  });

  it('marks the active route with the white pill state', () => {
    renderAppAt('/dashboard', 'CHAIR');
    const active = screen.getByRole('link', { name: 'Dashboard' });
    expect(active).toHaveClass('bg-white');
    expect(active).toHaveClass('text-faciload-900');
  });

  it('does not render the public Landing top nav inside the app shell', () => {
    renderAppAt('/dashboard', 'CHAIR');
    expect(screen.queryByRole('navigation', { name: 'Landing' })).not.toBeInTheDocument();
  });
});