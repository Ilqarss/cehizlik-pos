"use client";

import type { AuthUser, UserRole } from "@cehizlik/types";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TOKEN_KEY = "il_ay_access";
const REFRESH_KEY = "il_ay_refresh";

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  login: (credential: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (!token) { setLoading(false); return; }

    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        const json = await r.json();
        if (!r.ok || !json.success) throw new Error("Sessiya etibarsızdır");
        setUser(json.data as AuthUser);
        setAccessToken(token);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (credential: string, password: string) => {
    const r = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: credential, password })
    });
    const json = await r.json();
    if (!r.ok || !json.success) throw new Error(json.error ?? "Giriş alınmadı");

    const { accessToken: at, refreshToken, user: u } = json.data as { accessToken: string; refreshToken: string; user: AuthUser };
    localStorage.setItem(TOKEN_KEY, at);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    setAccessToken(at);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    const rt = localStorage.getItem(REFRESH_KEY);
    const at = localStorage.getItem(TOKEN_KEY);
    if (at) {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${at}` },
        body: JSON.stringify({ refreshToken: rt })
      }).catch(() => undefined);
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setUser(null);
    setAccessToken(null);
  }, []);

  const hasRole = useCallback((...roles: UserRole[]) => {
    return user ? roles.includes(user.role) : false;
  }, [user]);

  const value = useMemo(
    () => ({ user, accessToken, loading, login, logout, hasRole }),
    [accessToken, hasRole, loading, login, logout, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Authenticated API yardımçısı
export function useApi() {
  const { accessToken } = useAuth();
  return useCallback(async <T,>(path: string, options?: RequestInit): Promise<T> => {
    const r = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options?.headers
      }
    });
    const json = await r.json();
    if (!r.ok || !json.success) throw new Error(json.error ?? "API xətası");
    return json.data as T;
  }, [accessToken]);
}
