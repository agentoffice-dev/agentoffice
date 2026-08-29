import { createContext, useContext, useState, type ReactNode } from 'react'
import { authApi } from '../api/auth'
import type { AuthUser } from '../types'

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readAuth(): { user: AuthUser; token: string } | null {
  try {
    const stored = localStorage.getItem('auth')
    return stored ? (JSON.parse(stored) as { user: AuthUser; token: string }) : null
  } catch {
    localStorage.removeItem('auth')
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readAuth()?.user ?? null)
  const [token, setToken] = useState<string | null>(() => readAuth()?.token ?? null)

  const persist = (data: { user: AuthUser; token: string }) => {
    setUser(data.user)
    setToken(data.token)
    localStorage.setItem('auth', JSON.stringify(data))
  }

  const login = async (email: string, password: string) => {
    const data = await authApi.login(email, password)
    persist(data)
  }

  const register = async (username: string, email: string, password: string) => {
    const data = await authApi.register(username, email, password)
    persist(data)
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('auth')
  }

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
