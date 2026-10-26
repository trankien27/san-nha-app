// API thống kê trận, báo cáo, tài khoản (ADMIN) và cài đặt CLB; khớp với frontend web (sessionGameApi, managementApi, authApi, api.ts).
import { apiRequest } from '@/lib/api'
import type { AppRole, PagedResult, Player, PlaySessionStatus } from '@/lib/types'

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

// ---------- Thống kê trận (Chia trận) ----------

export type GameFormTrend = 'notEnoughData' | 'up' | 'steady' | 'down'

/** Một dòng thống kê. key: "p:<id hồ sơ>" (thành viên) hoặc "g:<TÊN KHÁCH>". recentForm: chuỗi T/B, mới nhất trước. */
export interface PlayerGameStats {
  key: string
  playerId: string | null
  name: string
  isGuest: boolean
  skillRating: number | null
  played: number
  wins: number
  losses: number
  winRate: number
  singlesPlayed: number
  singlesWins: number
  doublesPlayed: number
  doublesWins: number
  pointsFor: number
  pointsAgainst: number
  averagePointDiff: number
  minutesPlayed: number
  recentForm: string
  /** > 0: chuỗi thắng, < 0: chuỗi thua. */
  streak: number
  recentWinRate: number
  trend: GameFormTrend
  lastPlayedAtUtc: string
}
export interface PlayerGameHistoryItem { gameId: string; playSessionId: string; sessionCode: string; playedAtUtc: string; courtNo: number; isSingles: boolean; partners: string[]; opponents: string[]; scoreFor: number; scoreAgainst: number; won: boolean; durationMinutes: number | null }
export interface PlayerPairStat { name: string; games: number; wins: number }
export interface PlayerFormAnalysis { summary: PlayerGameStats; games: PlayerGameHistoryItem[]; partners: PlayerPairStat[]; opponents: PlayerPairStat[]; insights: string[] }

/** from/to dạng yyyy-MM-dd, tính theo ngày của buổi (Asia/Bangkok). */
export const getGameStats = (from: string, to: string) => apiRequest<PlayerGameStats[]>(`/api/game-stats?from=${from}&to=${to}`)
export const getPlayerForm = (key: string, from: string, to: string) =>
  apiRequest<PlayerFormAnalysis>(`/api/game-stats/player?key=${encodeURIComponent(key)}&from=${from}&to=${to}`)

// ---------- Báo cáo ----------

export interface FinanceSummary { charges: number; payments: number; outstanding: number; debtorCount: number }
export interface SessionReportRow { sessionId: string; code: string; title: string; venueId: string; venueName: string; status: PlaySessionStatus; startsAtUtc: string; participants: number; totalCost: number; costPerPerson: number }
export interface InventoryReportRow { itemId: string; code: string; name: string; stockOnHand: number; minimumStock: number; stockValue: number; isLowStock: boolean }
export interface PlayerDebtReportRow { playerId: string; memberCode: string; playerName: string; totalCharges: number; totalPaid: number; outstanding: number }
export interface PaymentReportRow { paymentId: string; paymentDate: string; playerName: string; amount: number; method: string; status: 'posted' | 'reversed' }
export interface ParticipationReportRow { playerId: string; memberCode: string; playerName: string; registered: number; present: number; absentExcused: number; absentUnexcused: number; gamesPlayed: number; gamesWon: number }
export interface SessionMaterialReportRow { sessionId: string; sessionCode: string; startsAtUtc: string; itemCode: string; itemName: string; quantity: number; value: number }
export interface CourtMaterialSummary { courtCost: number; materialCost: number; otherCost: number; totalCost: number }
export interface MonthlyTrend { year: number; month: number; payments: number; costs: number }
export interface VenueOption { id: string; name: string }
export interface SessionReportFilters { venueId?: string; status?: PlaySessionStatus }

function rangeQuery(from: string, to: string, filters: SessionReportFilters = {}, playerId?: string) {
  const q = new URLSearchParams({ from, to })
  if (filters.venueId) q.set('venueId', filters.venueId)
  if (filters.status) q.set('status', filters.status)
  if (playerId) q.set('playerId', playerId)
  return q.toString()
}

export const getFinanceSummary = (year: number, month: number) => apiRequest<FinanceSummary>(`/api/reports/finance?year=${year}&month=${month}`)
export const getMonthlyTrends = (year: number, month: number) => apiRequest<MonthlyTrend[]>(`/api/reports/trends?year=${year}&month=${month}`)
export const getSessionReport = (from: string, to: string, filters?: SessionReportFilters) => apiRequest<SessionReportRow[]>(`/api/reports/sessions?${rangeQuery(from, to, filters)}`)
export const getInventoryReport = () => apiRequest<InventoryReportRow[]>('/api/reports/inventory')
export const getDebtReport = () => apiRequest<PlayerDebtReportRow[]>('/api/reports/debts')
export const getPaymentReport = (from: string, to: string, playerId?: string) => apiRequest<PaymentReportRow[]>(`/api/reports/payments?${rangeQuery(from, to, {}, playerId)}`)
export const getParticipationReport = (from: string, to: string, playerId?: string, filters?: SessionReportFilters) =>
  apiRequest<ParticipationReportRow[]>(`/api/reports/participation?${rangeQuery(from, to, filters, playerId)}`)
export const getSessionMaterialReport = (from: string, to: string, filters?: SessionReportFilters) =>
  apiRequest<SessionMaterialReportRow[]>(`/api/reports/session-materials?${rangeQuery(from, to, filters)}`)
export const getCourtMaterialSummary = (from: string, to: string, filters?: SessionReportFilters) =>
  apiRequest<CourtMaterialSummary>(`/api/reports/court-material-summary?${rangeQuery(from, to, filters)}`)

/** Tất cả hồ sơ người chơi (mọi trạng thái) cho bộ lọc báo cáo; API phân trang tối đa 100 dòng. */
export async function getAllPlayers() {
  const all: Player[] = []
  for (let page = 1; ; page++) {
    const result = await apiRequest<PagedResult<Player>>(`/api/players?page=${page}&pageSize=100&sort=name`)
    all.push(...result.items)
    if (page >= result.totalPages) return all
  }
}
export const getActiveVenues = () => apiRequest<VenueOption[]>('/api/venues?isActive=true')

// ---------- Tài khoản (ADMIN) ----------

export interface UserAccount {
  id: string
  displayName: string
  email: string
  roles: AppRole[]
  isLocked: boolean
  mustChangePassword: boolean
  createdAtUtc: string
  lastLoginAtUtc: string | null
}
export interface CreateUserInput { displayName: string; email: string; roles: AppRole[] }
export type UserStatusFilter = 'active' | 'locked' | ''

export function getUsers(input: { page: number; pageSize: number; search?: string; role?: AppRole | ''; status?: UserStatusFilter }) {
  const q = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) })
  if (input.search) q.set('search', input.search)
  if (input.role) q.set('role', input.role)
  if (input.status) q.set('status', input.status)
  return apiRequest<PagedResult<UserAccount>>(`/api/admin/users?${q}`)
}
export const createUser = (input: CreateUserInput) => apiRequest<{ user: UserAccount; temporaryPassword: string }>('/api/admin/users', json('POST', input))
export const updateUserRoles = (userId: string, roles: AppRole[]) => apiRequest<UserAccount>(`/api/admin/users/${userId}/roles`, json('PUT', { roles }))
export const updateUserLock = (userId: string, isLocked: boolean) => apiRequest<UserAccount>(`/api/admin/users/${userId}/lock`, json('PUT', { isLocked }))
export const resetUserPassword = (userId: string) => apiRequest<{ temporaryPassword: string }>(`/api/admin/users/${userId}/reset-password`, json('POST'))

// ---------- Cài đặt CLB ----------

export type RoundingRule = 'none' | 'nearest500' | 'nearest1000' | 'up1000'
export interface ClubSettings {
  name: string
  address: string
  phoneNumber: string
  currency: 'VND'
  roundingRule: RoundingRule
  timeZone: 'Asia/Bangkok'
  updatedAtUtc: string
}
export type UpdateClubSettingsInput = Pick<ClubSettings, 'name' | 'address' | 'phoneNumber' | 'roundingRule'>

export const getClubSettings = () => apiRequest<ClubSettings>('/api/club-settings')
export const updateClubSettings = (input: UpdateClubSettingsInput) => apiRequest<ClubSettings>('/api/club-settings', json('PUT', input))
