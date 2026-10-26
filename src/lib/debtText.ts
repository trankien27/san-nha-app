// Dựng text công nợ để gửi vào nhóm hoặc gửi riêng từng người. Giống frontend/src/lib/debtText.ts.
import { formatVnd } from '@/lib/format'
import { bangkokDate, formatIsoDate, type DebtStatement, type DebtStatementItem, type DebtStatementPerson } from '@/lib/services/finance'

export interface DebtTextOptions { details: boolean; period: string; search: string }

function itemLine(item: DebtStatementItem) {
  const paid = item.paidAmount > 0 ? ` (đã trả ${formatVnd(item.paidAmount)}/${formatVnd(item.amount)})` : ''
  return `   - ${item.description}: ${formatVnd(item.outstanding)}${paid}`
}

function personLines(person: DebtStatementPerson, index: number, details: boolean) {
  const code = person.memberCode ? ` (${person.memberCode})` : ''
  const sessions = !details && person.items.length > 1 ? ` · ${person.items.length} buổi` : ''
  return [`${index + 1}. ${person.name}${code}: ${formatVnd(person.outstanding)}${sessions}`, ...(details ? person.items.map(itemLine) : [])]
}

function scopeLabel({ period, search }: DebtTextOptions) {
  const parts = [period ? `tháng ${period.slice(5, 7)}/${period.slice(0, 4)}` : '', search ? `tìm “${search}”` : ''].filter(Boolean)
  return parts.length ? ` · ${parts.join(' · ')}` : ''
}

/** Toàn bộ công nợ còn mở: người chơi trước, khách sau, mỗi người một dòng tổng (kèm từng buổi nếu chọn chi tiết). */
export function buildDebtStatementText(statement: DebtStatement, options: DebtTextOptions) {
  const { players, guests } = statement
  const lines = [
    `📋 CÔNG NỢ ĐẾN ${formatIsoDate(bangkokDate())}${scopeLabel(options)}`,
    `Người chơi: ${players.length} người · ${formatVnd(statement.playerOutstanding)}`,
    `Khách: ${guests.length} người · ${formatVnd(statement.guestOutstanding)}`,
    `Tổng còn nợ: ${formatVnd(statement.playerOutstanding + statement.guestOutstanding)}`,
  ]
  if (players.length) lines.push('', '👤 NGƯỜI CHƠI', ...players.flatMap((person, index) => personLines(person, index, options.details)))
  if (guests.length) lines.push('', '🙋 KHÁCH (không có hồ sơ)', ...guests.flatMap((person, index) => personLines(person, index, options.details)))
  return lines.join('\n')
}

/** Công nợ của một người để gửi riêng: luôn liệt kê từng buổi còn nợ. */
export function buildPersonDebtText(person: DebtStatementPerson) {
  const code = person.memberCode ? ` (${person.memberCode})` : person.isGuest ? ' (khách)' : ''
  return [
    `Công nợ của ${person.name}${code} đến ${formatIsoDate(bangkokDate())}:`,
    ...person.items.map((item) => itemLine(item).trimStart()),
    `Tổng còn nợ: ${formatVnd(person.outstanding)}`,
  ].join('\n')
}
