// API kho vật tư (khớp InventoryItemView / StockTransactionView của Be.Clean và frontend/src/lib/managementApi.ts).
import { apiRequest } from '@/lib/api'
import type { PagedResult } from '@/lib/types'

export interface InventoryItem {
  id: string
  code: string
  name: string
  category: string
  unit: string
  /** Số lượng là decimal ở backend (tối đa 3 chữ số thập phân). */
  stockOnHand: number
  minimumStock: number
  lastPurchasePrice: number
  /** Giá nhập (giá vốn bình quân), VNĐ nguyên. */
  averageCost: number
  supplier: string | null
  isActive: boolean
  notes: string | null
  isLowStock: boolean
  updatedAtUtc: string
  /** Giá xuất (tính cho người chơi); null = theo giá vốn. */
  salePrice: number | null
  effectiveSalePrice: number
}

export type InventoryPage = PagedResult<InventoryItem>

export interface UpsertInventoryItemInput {
  code: string
  name: string
  category: string
  unit: string
  minimumStock: number
  supplier: string | null
  isActive: boolean
  notes: string | null
}

export type StockTransactionType = 'purchase' | 'sessionUsage' | 'damaged' | 'lost' | 'adjustment' | 'reversal'
/** Loại giao dịch ghi tay; sessionUsage do bảng tiền lịch đánh tạo, reversal do nút đảo tạo. */
export type ManualStockType = 'purchase' | 'damaged' | 'lost' | 'adjustment'

export interface StockTransaction {
  id: number
  inventoryItemId: string
  itemName: string
  type: StockTransactionType
  quantityChange: number
  unitCost: number
  totalValue: number
  transactionDate: string
  playSessionId: string | null
  reversesTransactionId: number | null
  supplier: string | null
  reason: string
  createdAtUtc: string
}

export type StockTransactionPage = PagedResult<StockTransaction>

export interface RecordStockInput {
  type: ManualStockType
  quantity: number
  unitCost: number
  transactionDate: string
  playSessionId: string | null
  supplier: string | null
  reason: string
}

export const transactionLabels: Record<StockTransactionType, string> = {
  purchase: 'Nhập mua',
  sessionUsage: 'Dùng cho lịch đánh',
  damaged: 'Hư hỏng',
  lost: 'Thất thoát',
  adjustment: 'Điều chỉnh',
  reversal: 'Đảo giao dịch',
}

/** Server giới hạn pageSize tối đa 100. */
export const INVENTORY_PAGE_SIZE = 100

export function getInventory(input: { page?: number; pageSize?: number; search?: string; lowStock?: boolean } = {}) {
  const query = [`page=${input.page ?? 1}`, `pageSize=${input.pageSize ?? INVENTORY_PAGE_SIZE}`]
  if (input.search) query.push(`search=${encodeURIComponent(input.search)}`)
  if (input.lowStock) query.push('lowStock=true')
  return apiRequest<InventoryPage>(`/api/inventory/items?${query.join('&')}`)
}

/** Backend không có API lấy một vật tư: tìm theo mã (nếu biết) rồi dò lần lượt các trang. */
export async function getInventoryItem(id: string, codeHint?: string) {
  if (codeHint) {
    const found = (await getInventory({ search: codeHint })).items.find((item) => item.id === id)
    if (found) return found
  }
  for (let page = 1; ; page++) {
    const result = await getInventory({ page })
    const found = result.items.find((item) => item.id === id)
    if (found) return found
    if (page >= result.totalPages) throw new Error('Không tìm thấy vật tư.')
  }
}

export function createInventoryItem(input: UpsertInventoryItemInput) {
  return apiRequest<InventoryItem>('/api/inventory/items', { method: 'POST', body: JSON.stringify(input) })
}

export function updateInventoryItem(id: string, input: UpsertInventoryItemInput) {
  return apiRequest<InventoryItem>(`/api/inventory/items/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

/** unitPrice = giá nhập (giá vốn), salePrice = giá xuất tính cho người chơi; null thì giữ nguyên. Server ghi nhật ký giá cũ → giá mới. */
export function updateInventoryPrice(id: string, prices: { unitPrice: number | null; salePrice: number | null }, reason: string | null = null) {
  return apiRequest<InventoryItem>(`/api/inventory/items/${id}/price`, { method: 'PUT', body: JSON.stringify({ ...prices, reason }) })
}

export function recordStock(id: string, input: RecordStockInput) {
  return apiRequest<StockTransaction>(`/api/inventory/items/${id}/transactions`, { method: 'POST', body: JSON.stringify(input) })
}

export function getStockTransactions(itemId?: string, page = 1, pageSize = 50) {
  const query = [`page=${page}`, `pageSize=${pageSize}`]
  if (itemId) query.push(`itemId=${encodeURIComponent(itemId)}`)
  return apiRequest<StockTransactionPage>(`/api/inventory/transactions?${query.join('&')}`)
}

export function reverseStock(id: number, reason: string) {
  return apiRequest<StockTransaction>(`/api/inventory/transactions/${id}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) })
}

/** Số lượng kiểu vi-VN: 1.234,5 (tối đa 3 chữ số thập phân), không dùng Intl. */
export function formatQuantity(value: number) {
  const sign = value < 0 ? '-' : ''
  const [whole, fraction] = Math.abs(Math.round(value * 1000) / 1000).toFixed(3).split('.')
  const trimmed = fraction.replace(/0+$/, '')
  return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${trimmed ? `,${trimmed}` : ''}`
}

/** Đọc số lượng người dùng gõ (chấp nhận dấu phẩy thập phân); null nếu sai định dạng hoặc quá 3 chữ số thập phân. */
export function parseQuantity(text: string, allowNegative = false) {
  const normalized = text.trim().replace(',', '.')
  const pattern = allowNegative ? /^-?\d+(\.\d{1,3})?$/ : /^\d+(\.\d{1,3})?$/
  if (!pattern.test(normalized)) return null
  return Number(normalized)
}

/** Đọc tiền VNĐ nguyên (bỏ dấu chấm/khoảng trắng ngăn cách); null nếu không phải số nguyên không âm. */
export function parseVnd(text: string) {
  const trimmed = text.trim().replace(/\s/g, '')
  if (!/^\d+$/.test(trimmed) && !/^\d{1,3}(\.\d{3})+$/.test(trimmed)) return null
  return Number(trimmed.replace(/\./g, ''))
}
