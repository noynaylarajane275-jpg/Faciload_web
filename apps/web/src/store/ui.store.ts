import { create } from 'zustand';

interface UiState {
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  isRegisterModalOpen: boolean;
  openRegisterModal: () => void;
  closeRegisterModal: () => void;
  isSidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
}

/**
 * Lightweight global UI state, kept separate from auth state.
 * Auth store owns credentials/session; this store owns ephemeral
 * modal visibility so any "Log in" / "Get Started" button can open the same
 * modals without navigation or prop drilling. It also owns the mobile
 * sidebar drawer open/closed state. Login and Register are mutually
 * exclusive — opening one closes the other so the landing CTAs never stack
 * two auth dialogs.
 */
export const useUiStore = create<UiState>()((set) => ({
  isLoginModalOpen: false,
  openLoginModal: () => set({ isLoginModalOpen: true, isRegisterModalOpen: false }),
  closeLoginModal: () => set({ isLoginModalOpen: false }),
  isRegisterModalOpen: false,
  openRegisterModal: () => set({ isRegisterModalOpen: true, isLoginModalOpen: false }),
  closeRegisterModal: () => set({ isRegisterModalOpen: false }),
  isSidebarOpen: false,
  openSidebar: () => set({ isSidebarOpen: true }),
  closeSidebar: () => set({ isSidebarOpen: false }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
}));

