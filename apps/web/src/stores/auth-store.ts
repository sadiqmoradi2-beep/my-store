'use client';

import { create } from 'zustand';
import type { AuthUser } from '@my-store/shared';

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  /** Whether the initial refresh attempt has been performed? */
  bootstrapped: boolean;
  setAuth: (accessToken: string, user: AuthUser) => void;
  setUser: (user: AuthUser) => void;
  setBootstrapped: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  bootstrapped: false,
  setAuth: (accessToken, user) => set({ accessToken, user, bootstrapped: true }),
  setUser: (user) => set({ user }),
  setBootstrapped: () => set({ bootstrapped: true }),
  clear: () => set({ accessToken: null, user: null, bootstrapped: true }),
}));
