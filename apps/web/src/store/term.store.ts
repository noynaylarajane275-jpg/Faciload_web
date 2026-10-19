import { create } from 'zustand';
import { getActiveTerm, listTerms, type Term } from '../lib/terms';

interface TermState {
  terms: Term[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Selected term id — defaults to the active term once terms load. */
  selectedTermId: string | null;
  loadTerms: () => Promise<void>;
  selectTerm: (id: string) => void;
}

/**
 * Shared academic-term state for the header Term selector (AppShell) and any
 * page that needs "which term am I scheduling in" (Schedule). One fetch feeds
 * both: `GET /api/terms` for the list and `GET /api/terms/active` for the
 * default selection, so the selector lands on the seeded active term.
 */
export const useTermStore = create<TermState>()((set, get) => ({
  terms: [],
  status: 'idle',
  selectedTermId: null,
  async loadTerms() {
    if (get().status === 'loading') {
      return;
    }
    set({ status: 'loading' });
    try {
      const [list, active] = await Promise.all([listTerms(), getActiveTerm()]);
      const terms = list.data;
      const activeId =
        active.term?.id ?? terms.find((term) => term.is_active)?.id ?? terms[0]?.id ?? null;
      set((state) => ({
        terms,
        status: 'ready',
        // Keep an explicit user selection; otherwise adopt the active term.
        selectedTermId: state.selectedTermId ?? activeId,
      }));
    } catch {
      set({ status: 'error' });
    }
  },
  selectTerm: (id) => {
    if (id) {
      set({ selectedTermId: id });
    }
  },
}));

export function selectSelectedTerm(state: TermState): Term | null {
  if (!state.selectedTermId) {
    return null;
  }
  return state.terms.find((term) => term.id === state.selectedTermId) ?? null;
}
