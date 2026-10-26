// Định dạng tự viết (không dựa vào Intl) để chạy giống nhau trên Hermes iOS/Android và web.
// Giờ luôn hiển thị theo Asia/Bangkok (UTC+7, không có giờ mùa hè).

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const pad = (value: number) => String(value).padStart(2, '0')

/** Đối tượng Date mà các hàm getUTC* trả về giờ Bangkok. */
function bangkok(value: string | Date) {
  return new Date(new Date(value).getTime() + BANGKOK_OFFSET_MS)
}

export function formatVnd(value: number) {
  const sign = value < 0 ? '-' : ''
  return `${sign}${Math.abs(Math.trunc(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ₫`
}

/** 1.250.000 → "1,25tr"; dùng cho ô số nhỏ. */
export function formatVndShort(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}tr`
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`
  return formatVnd(value)
}

export const formatTime = (value: string) => { const d = bangkok(value); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
export const formatDate = (value: string) => { const d = bangkok(value); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}` }
export const formatWeekdayDate = (value: string) => { const d = bangkok(value); return `${weekdays[d.getUTCDay()]} ${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}` }

/** Ngày hôm nay theo Bangkok dạng yyyy-MM-dd (dùng cho ngày thanh toán). */
export function bangkokToday() {
  const d = bangkok(new Date())
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Mốc UTC của 0h Bangkok cách hôm nay `days` ngày (dùng làm bộ lọc from/to). */
export function bangkokDayStartUtc(days = 0) {
  const d = bangkok(new Date())
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days) - BANGKOK_OFFSET_MS).toISOString()
}

export function isSameBangkokDay(a: string, b: string | Date = new Date()) {
  const x = bangkok(a); const y = bangkok(b)
  return x.getUTCFullYear() === y.getUTCFullYear() && x.getUTCMonth() === y.getUTCMonth() && x.getUTCDate() === y.getUTCDate()
}

export function minutesSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[words.length - 2][0] + words[words.length - 1][0]).toUpperCase()
}

/** Thang trình độ 12 mức, trùng với backend SkillRatings.Labels. */
const skillLabels = ['Newbie', 'Yếu -', 'Yếu', 'Yếu +', 'TB yếu -', 'TB yếu', 'TB yếu +', 'TB -', 'Trung bình', 'TB +', 'TB khá', 'Khá']
export const skillLabel = (rating: number | null | undefined) => skillLabels[Math.min(Math.max(Math.round(rating ?? 9), 1), 12) - 1]

export const courtLetter = (courtNo: number) => String.fromCharCode(64 + courtNo)

export function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
