import { apiRequest, setAccessToken } from './api'
import type {
  Attendance, AttendanceInput, AuthEnvelope, Dashboard, DashboardAction, GameDraft, PagedResult, PersonalReport,
  PlaySession, Player, RegistrationRoster, SessionCost, SessionGameBoard, SuggestedRound, UserSession,
} from './types'

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

export async function login(email: string, password: string) {
  const result = await apiRequest<AuthEnvelope>('/api/auth/login', json('POST', { email, password, rememberMe: true }))
  setAccessToken(result.accessToken)
  return result.user
}
export const getCurrentUser = () => apiRequest<UserSession>('/api/auth/me')
export const logout = () => apiRequest<void>('/api/auth/logout', json('POST')).finally(() => setAccessToken(null))
export async function changePassword(currentPassword: string, newPassword: string) {
  const result = await apiRequest<AuthEnvelope>('/api/auth/change-password', json('POST', { currentPassword, newPassword }))
  setAccessToken(result.accessToken)
  return result.user
}

export const getDashboard = () => apiRequest<Dashboard>('/api/dashboard')
export const getDashboardActions = () => apiRequest<DashboardAction[]>('/api/dashboard/actions')
export const getPersonalReport = () => apiRequest<PersonalReport>('/api/reports/me')

export function getSessions(input: { from?: string; to?: string; status?: string; page?: number; pageSize?: number } = {}) {
  const q = new URLSearchParams({ page: String(input.page ?? 1), pageSize: String(input.pageSize ?? 50) })
  if (input.from) q.set('from', input.from)
  if (input.to) q.set('to', input.to)
  if (input.status) q.set('status', input.status)
  return apiRequest<PagedResult<PlaySession>>(`/api/play-sessions?${q}`)
}
export const getSession = (id: string) => apiRequest<PlaySession>(`/api/play-sessions/${id}`)

export const getRoster = (id: string) => apiRequest<RegistrationRoster>(`/api/play-sessions/${id}/registrations`)
export const registerMe = (id: string) => apiRequest<RegistrationRoster>(`/api/play-sessions/${id}/registrations/me`, json('POST'))
export const cancelMe = (id: string) => apiRequest<RegistrationRoster>(`/api/play-sessions/${id}/registrations/me`, json('DELETE'))

export const getAttendance = (id: string) => apiRequest<Attendance[]>(`/api/play-sessions/${id}/attendance`)
export const saveAttendance = (id: string, input: AttendanceInput[]) => apiRequest<Attendance[]>(`/api/play-sessions/${id}/attendance`, json('PUT', input))

/** Lấy hết người chơi đang hoạt động (API phân trang tối đa 100 dòng mỗi trang). */
export async function getActivePlayers() {
  const all: Player[] = []
  for (let page = 1; ; page++) {
    const result = await apiRequest<PagedResult<Player>>(`/api/players?page=${page}&pageSize=100&status=active&sort=name`)
    all.push(...result.items)
    if (page >= result.totalPages) return all
  }
}

export const getGameBoard = (id: string) => apiRequest<SessionGameBoard>(`/api/play-sessions/${id}/games`)
export const startGames = (id: string, games: GameDraft[]) => apiRequest<SessionGameBoard>(`/api/play-sessions/${id}/games`, json('POST', { games }))
export const suggestRound = (id: string, courtCount: number, restingAttendanceIds: string[] = []) =>
  apiRequest<SuggestedRound>(`/api/play-sessions/${id}/games/suggest`, json('POST', { courtCount, restingAttendanceIds }))
/** Xếp người vào nhóm sân A/B… (courtNo null = chưa xếp); chỉ những người gửi lên mới bị đổi. */
export const assignCourts = (id: string, assignments: { attendanceId: string; courtNo: number | null }[]) =>
  apiRequest<SessionGameBoard>(`/api/play-sessions/${id}/games/court-assignments`, json('PUT', { assignments }))
export const setCourtCount =(id: string, courtCount: number) => apiRequest<SessionGameBoard>(`/api/play-sessions/${id}/games/court-count`, json('PUT', { courtCount }))
export const finishGame = (id: string, gameId: string, input: { teamA: string[]; teamB: string[]; scoreA: number; scoreB: number }) =>
  apiRequest<SessionGameBoard>(`/api/play-sessions/${id}/games/${gameId}`, json('PUT', { ...input, finished: true, durationMinutes: null }))
export const cancelGame = (id: string, gameId: string) => apiRequest<SessionGameBoard>(`/api/play-sessions/${id}/games/${gameId}/cancel`, json('POST'))

export const getSessionCost = (id: string) => apiRequest<SessionCost>(`/api/session-costs/${id}`)
export const setGuestPaid = (id: string, chargeId: number, paid: boolean) => apiRequest<SessionCost>(`/api/session-costs/${id}/charges/${chargeId}/paid`, json('POST', { paid }))
export const recordPayment = (input: { playerId: string; amount: number; paymentDate: string; method: string; idempotencyKey: string; notes: string | null; receivableId: string | null }) =>
  apiRequest<unknown>('/api/payments', json('POST', { ...input, referenceCode: null }))
export const reversePayment = (paymentId: string, reason: string) => apiRequest<unknown>(`/api/payments/${paymentId}/reverse`, json('POST', { reason }))
