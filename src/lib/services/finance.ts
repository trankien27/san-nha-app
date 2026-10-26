// API và kiểu dữ liệu cho phần tiền (tính tiền buổi, công nợ, đã thu, thu chi, đối soát).
// Khớp với web frontend/src/lib/managementApi.ts và backend Be.Clean (JSON camelCase, enum chuỗi camelCase).
import { apiRequest } from '@/lib/api'
import type { PagedResult } from '@/lib/types'

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

// ---------- Kiểu dữ liệu ----------

export type CostAllocationMethod = 'equal' | 'weighted' | 'direct'
export type SessionCostCategory = 'court' | 'material' | 'drink' | 'coach' | 'other' | 'discount' | 'sponsorship'
export interface BillingCostLine { id: number; category: SessionCostCategory; description: string; amount: number; isAutomatic: boolean }
/** isExempt (miễn thu): vẫn tính vào số người chia nhưng không thu, không ghi công nợ. */
export interface BillingCharge { id: number; playerId: string | null; name: string; weight: number; surcharge: number; discount: number; amount: number; isWaived: boolean; isExempt?: boolean }
export interface SessionMaterial { inventoryItemId: string; code: string; name: string; unit: string; quantity: number; unitCost: number; amount: number }
export interface BillingDebt { chargeId: number; playerId: string | null; name: string; isGuest: boolean; amount: number; paidAmount: number; receivableId: string | null; paymentIds: string[] }
export type SessionCollectionMethod = 'cash' | 'bankTransfer' | 'other'
export interface SessionCollection {
  id: string
  playSessionId: string
  amount: number
  method: SessionCollectionMethod
  payerName: string | null
  collectedDate: string
  notes: string | null
  status: 'posted' | 'cancelled'
  recordedByName: string
  createdAtUtc: string
  cancelReason: string | null
  cancelledAtUtc: string | null
}
/** Bảng tiền đầy đủ của một buổi (GET /api/session-costs/{id}); bỏ qua các trường QR vì app không hiển thị. */
export interface BillingCost {
  id: string
  playSessionId: string
  sessionCode: string
  sessionTitle: string
  version: number
  isClosed: boolean
  allocationMethod: CostAllocationMethod
  totalAmount: number
  closedAtUtc: string | null
  lines: BillingCostLine[]
  charges: BillingCharge[]
  materials: SessionMaterial[]
  courtFee: number | null
  collectedAmount: number
  externalCollectedAmount: number
  collections: SessionCollection[] | null
  debts?: BillingDebt[] | null
  exemptAmount?: number
  courtActualCost?: number | null
}
export interface SaveSessionCostInput {
  allocationMethod: CostAllocationMethod
  lines: { category: SessionCostCategory; description: string; amount: number; isAutomatic: boolean }[]
  participants: { playerId: string | null; guestName: string | null; weight: number; surcharge: number; discount: number; directAmount: number; isWaived: boolean; isExempt?: boolean }[]
  materials: { inventoryItemId: string; quantity: number }[]
  participantCount?: number
  courtFee?: number
}
export interface RecordSessionCollectionInput { amount: number; method: SessionCollectionMethod; payerName: string | null; collectedDate: string | null; notes: string | null; idempotencyKey: string }

export interface InventoryItem {
  id: string
  code: string
  name: string
  category: string
  unit: string
  stockOnHand: number
  minimumStock: number
  averageCost: number
  isActive: boolean
  isLowStock: boolean
  salePrice: number | null
  /** Giá xuất tính cho người chơi (null salePrice = theo giá vốn). */
  effectiveSalePrice: number
}

export type ReceivableStatus = 'unpaid' | 'partiallyPaid' | 'paid' | 'overpaid' | 'waived' | 'reversed'
export interface FinanceReceivable { id: string; playerId: string; playerName: string; playSessionId: string | null; year: number; month: number; description: string; amount: number; paidAmount: number; outstandingAmount: number; status: ReceivableStatus; createdAtUtc: string }
export interface PaymentAllocation { receivableId: string; description: string; amount: number }
export interface FinancePayment { id: string; playerId: string; playerName: string; amount: number; paymentDate: string; method: string; referenceCode: string | null; idempotencyKey: string; notes: string | null; status: 'posted' | 'reversed'; reversalOfPaymentId: string | null; allocations: PaymentAllocation[]; createdAtUtc: string }
/** Tổng phát sinh / đã phân bổ / còn nợ (tính trước khi phân trang) kèm trang công nợ còn mở và trang đã thu. */
/** Bảng công nợ còn mở theo buổi: cột là buổi (playSessionId null = khoản không gắn buổi), ô thẳng hàng với cột, null khi không nợ. */
export interface DebtSessionColumn { playSessionId: string | null; sessionDate: string | null; title: string; outstanding: number }
export interface DebtCell { amount: number; paidAmount: number; outstanding: number }
export interface DebtTableRow { playerId: string | null; memberCode: string | null; name: string; isGuest: boolean; outstanding: number; cells: (DebtCell | null)[] }
export interface DebtStatement { playerOutstanding: number; guestOutstanding: number; columns: DebtSessionColumn[]; players: DebtTableRow[]; guests: DebtTableRow[] }
export interface PaymentOverview { charges: number; allocated: number; outstanding: number; receivables: PagedResult<FinanceReceivable>; payments: PagedResult<FinancePayment> }
export interface PaymentInput { playerId: string; amount: number; paymentDate: string; method: string; referenceCode: string | null; idempotencyKey: string; notes: string | null; receivableId?: string | null }

export interface CashFlow { from: string; to: string; collected: number; courtFees: number; materialPurchases: number; materialCost: number; materialRevenue: number; net: number; outstanding: number }
export interface SessionReconciliation { playSessionId: string; sessionCode: string; sessionTitle: string; startsAtUtc: string; courtListed: number; courtActual: number; courtRevenue: number; materialCost: number; materialListed: number; materialRevenue: number; exempt: number; receivable: number; collected: number; outstanding: number; profit: number; surchargeRevenue: number }
export interface Reconciliation { from: string; to: string; courtListed: number; courtActual: number; courtRevenue: number; materialCost: number; materialRevenue: number; exempt: number; receivable: number; collected: number; outstanding: number; profit: number; surchargeRevenue: number; sessions: SessionReconciliation[] }

// ---------- Tính tiền buổi ----------

export const getBillingCost = (sessionId: string) => apiRequest<BillingCost>(`/api/session-costs/${sessionId}`)
export const saveSessionCost = (sessionId: string, input: SaveSessionCostInput) => apiRequest<BillingCost>(`/api/session-costs/${sessionId}`, json('PUT', input))
export const closeSessionCost = (sessionId: string) => apiRequest<BillingCost>(`/api/session-costs/${sessionId}/close`, json('POST'))
export const reopenSessionCost = (sessionId: string, reason: string) => apiRequest<BillingCost>(`/api/session-costs/${sessionId}/reopen`, json('POST', { reason }))
export const setCourtActualCost = (sessionId: string, courtActualCost: number | null) => apiRequest<BillingCost>(`/api/session-costs/${sessionId}/court-actual-cost`, json('PUT', { courtActualCost }))
export const recordSessionCollection = (sessionId: string, input: RecordSessionCollectionInput) => apiRequest<BillingCost>(`/api/session-costs/${sessionId}/collections`, json('POST', input))
export const cancelSessionCollection = (sessionId: string, collectionId: string, reason: string) =>
  apiRequest<BillingCost>(`/api/session-costs/${sessionId}/collections/${collectionId}/cancel`, json('POST', { reason }))

/** Lấy hết vật tư trong kho (API phân trang tối đa 100 dòng mỗi trang). */
export async function getAllInventoryItems() {
  const all: InventoryItem[] = []
  for (let page = 1; ; page++) {
    const result = await apiRequest<PagedResult<InventoryItem>>(`/api/inventory/items?page=${page}&pageSize=100`)
    all.push(...result.items)
    if (page >= result.totalPages) return all
  }
}

// ---------- Công nợ / đã thu ----------

/** period dạng yyyy-MM hoặc '' (mọi tháng). */
export function getPaymentOverview(page: number, search: string, period: string) {
  const q = new URLSearchParams({ page: String(page), pageSize: '20' })
  if (search) q.set('search', search)
  if (period) { q.set('year', period.slice(0, 4)); q.set('month', String(Number(period.slice(5, 7)))) }
  return apiRequest<PaymentOverview>(`/api/finance/overview?${q}`)
}

/** Bảng công nợ còn mở theo buổi (cả khách); cùng bộ lọc tìm/tháng với danh sách công nợ. */
export function getDebtStatement(search: string, period: string) {
  const q = new URLSearchParams()
  if (search) q.set('search', search)
  if (period) { q.set('year', period.slice(0, 4)); q.set('month', String(Number(period.slice(5, 7)))) }
  return apiRequest<DebtStatement>(`/api/finance/debt-statement?${q}`)
}

/** Mọi công nợ còn mở (dùng cho form ghi đã thu theo người chơi). */
export async function getOpenReceivables() {
  const all: FinanceReceivable[] = []
  for (let page = 1; ; page++) {
    const result = await apiRequest<PagedResult<FinanceReceivable>>(`/api/receivables?page=${page}&pageSize=100`)
    all.push(...result.items)
    if (page >= result.totalPages) break
  }
  return all.filter(isOpenReceivable)
}

export function isOpenReceivable(receivable: FinanceReceivable) {
  return receivable.outstandingAmount > 0 && receivable.status !== 'paid' && receivable.status !== 'waived' && receivable.status !== 'reversed'
}

export const recordPayment = (input: PaymentInput) => apiRequest<FinancePayment>('/api/payments', json('POST', input))
export const reversePayment = (paymentId: string, reason: string) => apiRequest<FinancePayment>(`/api/payments/${paymentId}/reverse`, json('POST', { reason }))

// ---------- Báo cáo ----------

export const getCashFlow = (from: string, to: string) => apiRequest<CashFlow>(`/api/reports/cash-flow?${new URLSearchParams({ from, to })}`)
export const getReconciliation = (from: string, to: string) => apiRequest<Reconciliation>(`/api/reports/reconciliation?${new URLSearchParams({ from, to })}`)

// ---------- Tiện ích hiển thị ----------

export const receivableStatusLabels: Record<ReceivableStatus, string> = { unpaid: 'Chưa thu', partiallyPaid: 'Thu một phần', paid: 'Đã thu', overpaid: 'Thu thừa', waived: 'Miễn', reversed: 'Đã đảo' }
export const collectionMethodLabels: Record<SessionCollectionMethod, string> = { cash: 'Tiền mặt', bankTransfer: 'Chuyển khoản', other: 'Khác' }

/** Chỉ giữ chữ số (ô nhập tiền VNĐ là số nguyên). */
export const digitsOnly = (text: string) => text.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
/** "1250000" → "1.250.000" (không dùng Intl để chạy giống nhau trên Hermes). */
export const groupDigits = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** Chia đều chính xác đến từng đồng, giống backend: phần lẻ còn lại cộng 1đ lần lượt cho người đầu danh sách. */
export function splitEven(total: number, people: number) {
  if (people <= 0) return []
  const share = Math.floor(total / people)
  const leftover = total - share * people
  return Array.from({ length: people }, (_, index) => share + (index < leftover ? 1 : 0))
}

const vnd = (value: number) => `${value < 0 ? '-' : ''}${groupDigits(String(Math.abs(Math.trunc(value))))} ₫`
/** "43.000 ₫" khi mọi người bằng nhau; nếu làm tròn hoặc phụ phí tạo chênh lệch thì ghi rõ số người theo từng mức. */
export function perPersonText(amounts: number[]) {
  if (!amounts.length) return '—'
  const groups = amounts.reduce<Map<number, number>>((map, amount) => map.set(amount, (map.get(amount) ?? 0) + 1), new Map())
  if (groups.size === 1) return vnd(amounts[0])
  return [...groups.entries()].sort((a, b) => b[1] - a[1]).map(([amount, count]) => `${vnd(amount)} × ${count} người`).join(' · ')
}

const pad = (value: number) => String(value).padStart(2, '0')
/** Ngày theo Bangkok cách hôm nay `days` ngày, dạng yyyy-MM-dd. */
export function bangkokDate(days = 0) {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
/** Tháng hiện tại theo Bangkok, dạng yyyy-MM. */
export const currentMonth = () => bangkokDate().slice(0, 7)
export function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split('-').map(Number)
  const d = new Date(Date.UTC(year, value - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}
/** Ngày đầu và cuối tháng (yyyy-MM-dd) cho bộ lọc from/to của báo cáo. */
export function monthRange(month: string) {
  const [year, value] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, value, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${pad(lastDay)}` }
}
export const monthLabel = (month: string) => `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`
/** "2026-10-26" → "26/10/2026". */
export function formatIsoDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}
/** "26/10/2026" → "2026-10-26"; null nếu không phải ngày hợp lệ. */
export function parseVnDate(text: string) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim())
  if (!match) return null
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}
