import { create } from 'zustand';

interface SessionState {
  token: string | null;
  setToken: (token: string | null) => void;
}

// Phase 1 shell only — real auth state lands in Phase 2.
export const useSessionStore = create<SessionState>()((set) => ({
  token: null,
  setToken: (token) => set({ token }),
}));
