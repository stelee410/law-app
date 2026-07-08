import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthToken, User } from '../lib/types';

type AuthState = {
  token: string | null;
  user: User | null;
  expiresAt: string | null;
  setSession: (session: AuthToken) => void;
  setUser: (user: User) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      expiresAt: null,
      setSession: (session) => set({ token: session.token, user: session.user, expiresAt: session.expiresAt }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null, expiresAt: null })
    }),
    {
      name: 'law-ai-auth'
    }
  )
);
