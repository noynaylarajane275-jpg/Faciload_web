import { create } from 'zustand';

interface UiState {
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  isSidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
}

/**
 * Lightweight global UI state, kept separate from auth state.
 * Auth store owns credentials/session; this store owns ephemeral
 * modal visibility so any "Log in" button can open the same modal
 * without navigation or prop drilling. It also owns the mobile
 * sidebar drawer open/closed state.
 */
export const useUiStore = create<UiState>()((set) => ({
  isLoginModalOpen: false,
  openLoginModal: () => set({ isLoginModalOpen: true }),
  closeLoginModal: () => set({ isLoginModalOpen: false }),
  isSidebarOpen: false,
  openSidebar: () => set({ isSidebarOpen: true }),
  closeSidebar: () => set({ isSidebarOpen: false }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
}));

