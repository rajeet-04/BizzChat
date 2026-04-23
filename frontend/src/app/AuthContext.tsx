import React, { createContext, useContext, useState, useEffect } from "react";
import { useApiClient } from "./ApiClientContext";

import { API_BASE_URL } from "../lib/config";

const API_BASE = API_BASE_URL;


export interface User {
  id: string;
  name: string;
  email: string;
  orgId: string;
  orgName: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (token: string, user: User) => void;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = "bizchat_auth_v2";

function saveSession(token: string, user: User) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
}

function loadSession(): { token: string; user: User } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = useApiClient();
  
  const [user, setUser] = useState<User | null>(() => {
    const session = loadSession();
    if (session) {
      client.setAuthToken(session.token);
      return session.user;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Login failed");
    client.setAuthToken(data.token);
    setUser(data.user);
    saveSession(data.token, data.user);
  };

  const loginWithToken = (token: string, u: User) => {
    client.setAuthToken(token);
    setUser(u);
    saveSession(token, u);
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Registration failed");
    client.setAuthToken(data.token);
    setUser(data.user);
    saveSession(data.token, data.user);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    client.setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, loginWithToken, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
