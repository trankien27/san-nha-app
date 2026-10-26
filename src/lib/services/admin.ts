// API quản trị cho mobile: người chơi, tạo/sửa/hủy lịch đánh, đăng ký hộ, địa điểm và sân.
// Khớp với Be.Clean (Contracts.cs, ApiEndpoints.cs) và các file lib/*Api.ts của web.
import { apiRequest, ApiError } from '@/lib/api'
import type { PagedResult, PlaySessionStatus, RegistrationRoster } from '@/lib/types'

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

// ---------- Người chơi ----------

export type PlayerStatus = 'active' | 'paused' | 'left'
export type PlayerGender = 'male' | 'female' | 'other'
export type PlayerMembershipType = 'member' | 'guest' | 'walkIn'
export type PlayerSkillLevel = 'beginner' | 'intermediate' | 'advanced'

export interface PlayerDetail {
  id: string
  memberCode: string
  fullName: string
  phoneNumber: string | null
  email: string | null
  /** yyyy-MM-dd */
  birthDate: string | null
  gender: PlayerGender | null
  skillLevel: PlayerSkillLevel
  membershipType: PlayerMembershipType
  /** yyyy-MM-dd */
  joinedOn: string
  monthlyFee: number
  creditBalance: number
  status: PlayerStatus
  notes: string | null
  userId: string | null
  createdAtUtc: string
  updatedAtUtc: string
  skillRating: number | null
  effectiveSkillRating: number
}

export interface UpsertPlayerInput {
  memberCode: string
  fullName: string
  phoneNumber: string | null
  email: string | null
  birthDate: string | null
  gender: PlayerGender | null
  skillLevel: PlayerSkillLevel
  membershipType: PlayerMembershipType
  joinedOn: string
  /** Phí tháng đã bỏ, luôn gửi 0 như web. */
  monthlyFee: number
  status: PlayerStatus
  notes: string | null
  userId: string | null
  skillRating: number | null
}

export const playerStatusLabels: Record<PlayerStatus, string> = { active: 'Đang hoạt động', paused: 'Tạm nghỉ', left: 'Đã rời CLB' }
export const membershipLabels: Record<PlayerMembershipType, string> = { member: 'Thường xuyên', guest: 'Khách', walkIn: 'Vãng lai' }
export const genderLabels: Record<PlayerGender, string> = { male: 'Nam', female: 'Nữ', other: 'Khác' }

/** Thang trình độ 12 mức (đầy đủ chữ như web lib/skillLevels.ts). */
export const skillLevelLabels = [
  'Newbie', 'Yếu -', 'Yếu', 'Yếu +', 'Trung bình yếu -', 'Trung bình yếu', 'Trung bình yếu +',
  'Trung bình -', 'Trung bình', 'Trung bình +', 'Trung bình khá', 'Khá',
] as const
export const defaultSkillRating = 9
/** Mức 3 bậc cũ vẫn lưu ở backend để tương thích; luôn suy ra từ trình độ. */
export const legacySkillLevel = (rating: number): PlayerSkillLevel => (rating <= 3 ? 'beginner' : rating <= 9 ? 'intermediate' : 'advanced')

export function getPlayerPage(input: { page?: number; pageSize?: number; search?: string; status?: PlayerStatus | ''; sort?: string } = {}) {
  const q = new URLSearchParams({ page: String(input.page ?? 1), pageSize: String(input.pageSize ?? 20), sort: input.sort ?? 'name' })
  if (input.search) q.set('search', input.search)
  if (input.status) q.set('status', input.status)
  return apiRequest<PagedResult<PlayerDetail>>(`/api/players?${q}`)
}
export const getPlayer = (id: string) => apiRequest<PlayerDetail>(`/api/players/${id}`)
export const createPlayer = (input: UpsertPlayerInput) => apiRequest<PlayerDetail>('/api/players', json('POST', input))
export const updatePlayer = (id: string, input: UpsertPlayerInput) => apiRequest<PlayerDetail>(`/api/players/${id}`, json('PUT', input))

// ---------- Địa điểm & sân ----------

export interface Venue {
  id: string
  name: string
  address: string
  mapUrl: string | null
  phoneNumber: string | null
  notes: string | null
  isActive: boolean
  courtCount: number
  activeCourtCount: number
}
export interface UpsertVenueInput { name: string; address: string; mapUrl: string; phoneNumber: string; notes: string; isActive: boolean }

export interface Court {
  id: string
  code: string
  name: string
  venueId: string
  venueName: string
  venueMapUrl: string | null
  venueIsActive: boolean
  /** Hỗ trợ (không kèm Quản trị/Kế toán) luôn nhận 0 vì server ẩn tiền. */
  defaultHourlyRate: number
  isActive: boolean
  notes: string | null
}
export interface UpsertCourtInput { code: string; name: string; venueId: string; defaultHourlyRate: number; isActive: boolean; notes: string }

export function getVenues(isActive?: boolean) {
  return apiRequest<Venue[]>(`/api/venues${isActive === undefined ? '' : `?isActive=${isActive}`}`)
}
export const createVenue = (input: UpsertVenueInput) => apiRequest<Venue>('/api/venues', json('POST', input))
export const updateVenue = (id: string, input: UpsertVenueInput) => apiRequest<Venue>(`/api/venues/${id}`, json('PUT', input))
/** Server không xóa vật lý: chuyển địa điểm và toàn bộ sân sang ngừng hoạt động. */
export const archiveVenue = (id: string) => apiRequest<void>(`/api/venues/${id}`, json('DELETE'))

/** Lấy hết sân (API phân trang tối đa 100 dòng mỗi trang). */
export async function getAllCourts() {
  const all: Court[] = []
  for (let page = 1; ; page++) {
    const result = await apiRequest<PagedResult<Court>>(`/api/courts?page=${page}&pageSize=100`)
    all.push(...result.items)
    if (page >= result.totalPages) return all
  }
}
/** Sân đang hoạt động dùng để xếp lịch (tối đa 100 sân). */
export const getSchedulingCourts = () => apiRequest<PagedResult<Court>>('/api/courts/scheduling-options').then((result) => result.items)
export const createCourt = (input: UpsertCourtInput) => apiRequest<Court>('/api/courts', json('POST', input))
export const updateCourt = (id: string, input: UpsertCourtInput) => apiRequest<Court>(`/api/courts/${id}`, json('PUT', input))
/** Server không xóa vật lý: chuyển sân sang ngừng hoạt động. */
export const archiveCourt = (id: string) => apiRequest<void>(`/api/courts/${id}`, json('DELETE'))

export function isGoogleMapsUrl(value: string) {
  const match = /^https?:\/\/([^/?#:]+)/i.exec(value.trim())
  if (!match) return false
  const host = match[1].toLowerCase()
  return host === 'maps.app.goo.gl' || host === 'goo.gl' || host === 'google.com' || host.endsWith('.google.com')
}

// ---------- Lịch đánh ----------

export interface AdminSessionCourt { id: string; courtId: string; code: string; name: string; startsAtUtc: string; endsAtUtc: string }
/** PlaySession đầy đủ trường cần cho form (mobile types.ts chỉ khai báo phần hiển thị). */
export interface AdminPlaySession {
  id: string
  code: string
  title: string
  venueId: string
  venueName: string
  startsAtUtc: string
  endsAtUtc: string
  maxParticipants: number
  registrationDeadlineUtc: string
  organizerId: string
  organizerName: string
  notes: string | null
  status: PlaySessionStatus
  cancellationReason: string | null
  seriesId: string | null
  courts: AdminSessionCourt[]
  registeredCount: number
  waitlistedCount: number
  courtFee: number | null
  courtActualCost: number | null
  courtCount: number
}
export interface OrganizerOption { id: string; displayName: string; email: string }
export interface UpsertPlaySessionInput {
  code: string
  title: string
  venueId: string
  startsAt: string
  endsAt: string
  maxParticipants: number
  registrationDeadline: string
  organizerId: string
  courtIds: string[]
  courtBookings?: { courtId: string; startsAt: string; endsAt: string }[]
  notes: string
  status: 'draft' | 'open' | 'full'
  courtFee: number | null
  courtCount: number | null
  courtActualCost: number | null
}

export const getAdminSession = (id: string) => apiRequest<AdminPlaySession>(`/api/play-sessions/${id}`)
export const getOrganizers = () => apiRequest<OrganizerOption[]>('/api/play-sessions/organizers')
export const createSession = (input: UpsertPlaySessionInput) => apiRequest<AdminPlaySession>('/api/play-sessions', json('POST', input))
/** repeatUntil dạng yyyy-MM-dd; server tạo mỗi tuần một lịch riêng, tối đa 52 tuần. */
export const createRecurringSessions = (input: UpsertPlaySessionInput, repeatUntil: string) =>
  apiRequest<AdminPlaySession[]>('/api/play-sessions/recurring', json('POST', { session: input, repeatUntil }))
export const updateSession = (id: string, input: UpsertPlaySessionInput) => apiRequest<AdminPlaySession>(`/api/play-sessions/${id}`, json('PUT', input))
export const cancelSession = (id: string, reason: string) => apiRequest<AdminPlaySession>(`/api/play-sessions/${id}/cancel`, json('POST', { reason }))

// ---------- Đăng ký hộ người chơi ----------

/** id là id hồ sơ người chơi; email rỗng thì server trả mã người chơi. */
export interface RegistrationPlayerOption { id: string; displayName: string; email: string }
export function getRegistrationPlayers(search?: string) {
  const term = search?.trim()
  return apiRequest<RegistrationPlayerOption[]>(`/api/play-sessions/registration-players${term ? `?search=${encodeURIComponent(term)}` : ''}`)
}
export const addRegistration = (sessionId: string, playerId: string) =>
  apiRequest<RegistrationRoster>(`/api/play-sessions/${sessionId}/registrations`, json('POST', { playerId }))
export const removeRegistration = (sessionId: string, playerId: string) =>
  apiRequest<RegistrationRoster>(`/api/play-sessions/${sessionId}/registrations/${playerId}`, json('DELETE'))

// ---------- Lỗi theo trường ----------

/** Gom lỗi validation của server (PascalCase, có thể kèm tiền tố "Session.") về tên ô trên form. */
export function fieldErrorsFrom<K extends string>(error: unknown, map: Record<string, K>): Partial<Record<K, string>> {
  const result: Partial<Record<K, string>> = {}
  if (!(error instanceof ApiError)) return result
  Object.entries(error.fieldErrors).forEach(([key, messages]) => {
    const field = map[key] ?? map[key.split('.').pop() ?? key]
    if (field && messages[0] && !result[field]) result[field] = messages[0]
  })
  return result
}

// ---------- Ngày giờ nhập tay (giờ Asia/Bangkok, UTC+7 cố định) ----------

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
const pad = (value: number) => String(value).padStart(2, '0')

/** Tách mốc UTC thành ngày (yyyy-MM-dd) và giờ (HH:mm) theo Bangkok. */
export function bangkokParts(utc: string) {
  const d = new Date(new Date(utc).getTime() + BANGKOK_OFFSET_MS)
  return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
}

/** "27/10/2026", "27-10-2026", "27.10.2026" → "2026-10-27"; sai định dạng hoặc ngày không tồn tại → null. */
export function parseDateInput(value: string): string | null {
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value.trim())
  if (!match) return null
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const check = new Date(Date.UTC(year, month - 1, day))
  if (year < 1900 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/** "2026-10-27" → "27/10/2026". */
export function toDateInput(isoDate: string | null | undefined) {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

/** "19:00", "19.00", "1900", "7:5" → "19:00" / "07:05"; sai → null. */
export function parseTimeInput(value: string): string | null {
  const trimmed = value.trim()
  const match = /^(\d{1,2})[:.h](\d{1,2})$/.exec(trimmed) ?? /^(\d{2})(\d{2})$/.exec(trimmed)
  if (!match) return null
  const [hour, minute] = [Number(match[1]), Number(match[2])]
  if (hour > 23 || minute > 59) return null
  return `${pad(hour)}:${pad(minute)}`
}

/** Cộng ngày cho chuỗi yyyy-MM-dd. */
export function addDays(isoDate: string, days: number) {
  const value = new Date(`${isoDate}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/** Ngày giờ Bangkok gửi lên server dạng ISO kèm +07:00 (giống web gửi giờ Việt Nam). */
export const bangkokIso = (isoDate: string, time: string) => `${isoDate}T${time}:00+07:00`

export const weekdayNames = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']
export const weekdayOf = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).getUTCDay()
