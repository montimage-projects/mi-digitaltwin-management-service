import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TourStatus = 'idle' | 'active' | 'dismissed' | 'completed';

interface TourState {
  status: TourStatus;
  stepIndex: number;
  /** Opens the tour at its first step. */
  start: () => void;
  /** Advances one step; `stepCount` bounds the index to the last step. */
  next: (stepCount: number) => void;
  /** Goes back one step, never below the first. */
  prev: () => void;
  /** Closes the tour early (skip, Esc, outside click, close button). */
  dismiss: () => void;
  /** Closes the tour after its last step. */
  complete: () => void;
}

export const useTourStore = create<TourState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      stepIndex: 0,

      start: () => set({ status: 'active', stepIndex: 0 }),

      next: (stepCount: number) => {
        const { stepIndex } = get();
        set({ stepIndex: Math.min(stepIndex + 1, Math.max(stepCount - 1, 0)) });
      },

      prev: () => set({ stepIndex: Math.max(get().stepIndex - 1, 0) }),

      dismiss: () => set({ status: 'dismissed', stepIndex: 0 }),

      complete: () => set({ status: 'completed', stepIndex: 0 }),
    }),
    {
      name: 'tour-storage',
      // Persist only the outcome. An in-progress tour is stored as 'idle' so a
      // reload never re-opens it — the tour only ever starts on demand.
      partialize: (state) => ({
        status: state.status === 'active' ? 'idle' : state.status,
      }),
    }
  )
);
