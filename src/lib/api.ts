import type { AuthEnvelope } from './types'

interface ProblemDetails {
  title?: string
  detail?: string
  errors?: Record<string, string[]>
}

// Mặc định gọi backend cloud. Refresh token đi qua cookie HttpOnly: trên iOS/Android, fetch của
// React Native tự lưu và gửi lại cookie của backend nên không cần lưu token ra bộ nhớ máy.
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://bm-club-be.fly.dev').replace(/\/+$/, '')

let accessToken: string | null = null
let refreshPromise: Promise<AuthEnvelope> | null = null
let authExpiredHandler: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setAuthExpiredHandler(handler: (() => void) | null) {
  authExpiredHandler = handler
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
  }
}

const url = (path: string) => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`

/** Đổi refresh cookie lấy access token mới; nhiều request cùng hết hạn chỉ refresh một lần. */
export function refreshSession() {
  refreshPromise ??= fetch(url('/api/auth/refresh'), { method: 'POST', credentials: 'include', headers: { Accept: 'application/json' } })
    .then(async (response) => {
      if (!response.ok) {
        accessToken = null
        throw new ApiError('Phiên đăng nhập đã hết hạn.', response.status)
      }
      const payload = await response.json() as AuthEnvelope
      accessToken = payload.accessToken
      return payload
    })
    .finally(() => { refreshPromise = null })
  return refreshPromise
}

const noRefreshPaths = ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout']

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const send = (token: string | null) => fetch(url(path), {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  })

  let response: Response
  try {
    const sentToken = accessToken
    response = await send(sentToken)
    if (response.status === 401 && !noRefreshPaths.includes(path)) {
      try {
        const token = accessToken && accessToken !== sentToken ? accessToken : (await refreshSession()).accessToken
        response = await send(token)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) authExpiredHandler?.()
        throw error
      }
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', 0)
  }

  if (!response.ok) {
    const details = await response.json().catch(() => ({})) as ProblemDetails
    const fieldMessage = details.errors ? Object.values(details.errors).flat()[0] : undefined
    throw new ApiError(details.detail || fieldMessage || details.title || 'Yêu cầu chưa thể hoàn tất.', response.status, details.errors)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function errorMessage(error: unknown, fallback = 'Đã có lỗi xảy ra.') {
  return error instanceof Error ? error.message : fallback
}
