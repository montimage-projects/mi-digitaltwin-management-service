import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  username: string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  // Token is persisted to localStorage so sessions survive page reloads.
  // Trade-off: readable by any injected script; bounded by JWT expiry.
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (token: string, user: User) => {
        set({
          token,
          user,
          isAuthenticated: true,
        });
      },

      logout: () => {
        set({
          token: null,
          user: null,
          isAuthenticated: false,
        });
      },

      setUser: (user: User) => {
        set({ user });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // The JWT persists to localStorage so sessions survive page reloads.
        // Accepted risk: an XSS payload could read the stored value.
        // Mitigations: strict CSP (script-src 'self' + cdn.jsdelivr.net only,
        // no unsafe-inline/eval — see server/src/app.ts), npm audit in CI,
        // short JWT expiry, and the 401 → logout interceptor that clears the
        // persisted state.
        token: state.token, // gitleaks:allow — field name, not a credential
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
