import axios from 'axios'
import type { AuthResponse } from '../types'

const base = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '' })

export const authApi = {
  register: (username: string, email: string, password: string) =>
    base.post<AuthResponse>('/api/auth/register', { username, email, password }).then(r => r.data),

  login: (email: string, password: string) =>
    base.post<AuthResponse>('/api/auth/login', { email, password }).then(r => r.data),
}
