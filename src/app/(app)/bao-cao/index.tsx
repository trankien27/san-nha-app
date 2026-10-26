import { Stack } from 'expo-router'
import { useMemo, useState, type ReactNode } from 'react'
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/auth/AuthContext'
import { bangkokToday, formatTime, formatVnd, formatWeekdayDate } from '@/lib/format'
import {
  getActiveVenues, getAllPlayers, getCourtMaterialSummary, getDebtReport, getFinanceSummary, getInventoryReport, getMonthlyTrends,
  getParticipationReport, getPaymentReport, getSessionMaterialReport, getSessionReport,
  type InventoryReportRow, type ParticipationReportRow, type PaymentReportRow, type PlayerDebtReportRow, type SessionMaterialReportRow, type SessionReportRow,
} from '@/lib/services/reports'
import type { PlaySessionStatus } from '@/lib/types'
import { useLoad } from '@/lib/useLoad'
import { Button, Card, Chip, EmptyState, ErrorState, Icon, Loading, SectionTitle, styles as ui, type IconName } from '@/ui/components'
import { statusMeta } from '@/ui/SessionCard'
import { colors, font } from '@/ui/theme'

type Tab = 'finance' | 'participation' | 'inventory'
const tabs: [Tab, string][] = [['finance', 'Tài chính'], ['participation', 'Tham gia'], ['inventory', 'Vật tư']]
const statusOptions: [PlaySessionStatus | '', string][] = [['', 'Trừ lịch đã hủy'], ['open', 'Sắp tới'], ['completed', 'Đã đánh'], ['costClosed', 'Đã chốt tiền'], ['cancelled', 'Đã hủy']]

/** Báo cáo theo tháng (Quản trị, Kế toán): tài chính, tham gia và vật tư; giống trang Thống kê trên web, trừ xuất Excel. */
export default function ReportsScreen() {
  const roles = useAuth().user?.roles ?? []
  const allowed = roles.includes('ADMIN') || roles.includes('TREASURER')
  return (
    <>
      <Stack.Screen options={{ title: 'Báo cáo' }} />
      {allowed ? <Reports /> : <EmptyState icon="lock-outline" title="Bạn không có quyền xem báo cáo" message="Chỉ Quản trị và Kế toán xem được mục này." />}
    </>
  )
}

function Reports() {
  const [tab, setTab] = useState<Tab>('finance')
  const [month, setMonth] = useState(() => bangkokToday().slice(0, 7))
  const [playerId, setPlayerId] = useState('')
  const [venueId, setVenueId] = useState('')
  const [status, setStatus] = useState<PlaySessionStatus | ''>('')
  const [showFilters, setShowFilters] = useState(false)
  const [pickingPlayer, setPickingPlayer] = useState(false)

  const options = useLoad(async () => {
    const [players, venues] = await Promise.all([getAllPlayers(), getActiveVenues()])
    return { players, venues }
  }, 'options')

  const range = monthRange(month)
  const year = Number(month.slice(0, 4))
  const monthNo = Number(month.slice(5, 7))
  const report = useLoad(async () => {
    const filters = { venueId: venueId || undefined, status: status || undefined }
    const [summary, sessions, inventory, debts, payments, participation, materials, courtMaterial] = await Promise.all([
      getFinanceSummary(year, monthNo), getSessionReport(range.from, range.to, filters), getInventoryReport(), getDebtReport(),
      getPaymentReport(range.from, range.to, playerId || undefined), getParticipationReport(range.from, range.to, playerId || undefined, filters),
      getSessionMaterialReport(range.from, range.to, filters), getCourtMaterialSummary(range.from, range.to, filters),
    ])
    return { summary, sessions, inventory, debts, payments, participation, materials, courtMaterial }
  }, `${month}|${playerId}|${venueId}|${status}`)
  const trends = useLoad(() => getMonthlyTrends(year, monthNo), month)

  const players = options.data?.players ?? []
  const venues = options.data?.venues ?? []
  const playerName = players.find((player) => player.id === playerId)?.fullName
  const activeFilters = [playerId, venueId, status].filter(Boolean).length
  const data = report.data

  const refresh = () => { void report.reload(); void trends.reload(); if (options.error) void options.reload() }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={report.refreshing} onRefresh={refresh} tintColor={colors.brand} />}>
        <View style={styles.monthBar}>
          <IconButton icon="chevron-left" label="Tháng trước" onPress={() => setMonth(shiftMonth(month, -1))} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: font.caption, color: colors.muted }}>Kỳ báo cáo</Text>
            <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.ink }}>Tháng {month.slice(5)}/{month.slice(0, 4)}</Text>
          </View>
          <IconButton icon="chevron-right" label="Tháng sau" onPress={() => setMonth(shiftMonth(month, 1))} />
        </View>

        <Pressable accessibilityRole="button" onPress={() => setShowFilters((value) => !value)} style={styles.filterToggle}>
          <Icon name="filter-variant" size={18} color={colors.brand} />
          <Text style={{ flex: 1, fontSize: font.body, color: colors.brand, fontWeight: '600' }}>Bộ lọc{activeFilters ? ` (${activeFilters})` : ''}</Text>
          <Icon name={showFilters ? 'chevron-up' : 'chevron-down'} color={colors.brand} />
        </Pressable>
        {showFilters && (
          <Card style={{ gap: 10, marginTop: 8 }}>
            <Text style={styles.label}>Người chơi</Text>
            <Pressable accessibilityRole="button" onPress={() => setPickingPlayer(true)} disabled={!options.data} style={styles.select}>
              <Text style={{ flex: 1, fontSize: font.body, color: colors.ink }} numberOfLines={1}>{options.loading ? 'Đang tải danh sách…' : options.error ? 'Không tải được danh sách người chơi' : playerName ?? 'Tất cả người chơi'}</Text>
              {playerId ? <Pressable accessibilityLabel="Bỏ lọc người chơi" hitSlop={10} onPress={() => setPlayerId('')}><Icon name="close-circle" color={colors.muted} /></Pressable> : <Icon name="chevron-down" color={colors.muted} />}
            </Pressable>
            {options.error && <Button label="Tải lại danh sách lọc" tone="outline" icon="refresh" onPress={() => void options.reload()} />}
            <Text style={styles.label}>Địa điểm</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Toggle label="Tất cả địa điểm" active={!venueId} onPress={() => setVenueId('')} />
              {venues.map((venue) => <Toggle key={venue.id} label={venue.name} active={venueId === venue.id} onPress={() => setVenueId(venue.id)} />)}
            </ScrollView>
            <Text style={styles.label}>Trạng thái lịch đánh</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {statusOptions.map(([value, label]) => <Toggle key={value || 'all'} label={label} active={status === value} onPress={() => setStatus(value)} />)}
            </ScrollView>
          </Card>
        )}

        <View style={styles.tabs}>
          {tabs.map(([value, label]) => (
            <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.tabActive]}>
              <Text style={{ fontSize: font.body, fontWeight: tab === value ? '700' : '500', color: tab === value ? colors.brand : colors.muted }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.note}>Tổng tài chính và biểu đồ thu áp dụng toàn CLB; công nợ và tồn kho là số dư hiện tại. Bộ lọc người chơi áp dụng cho thanh toán và tham gia; địa điểm/trạng thái áp dụng cho lịch đánh và vật tư dùng theo lịch đánh. Xuất Excel chỉ có trên bản web.</Text>

        {report.loading ? <Loading label="Đang tổng hợp dữ liệu…" />
          : report.error || !data ? <ErrorState message={report.error ?? 'Không thể tổng hợp báo cáo.'} onRetry={() => void report.reload()} />
            : (
              <>
                {tab === 'finance' && (
                  <>
                    <View style={styles.metrics}>
                      <Metric icon="trending-up" label="Phát sinh kỳ này" value={formatVnd(data.summary.charges)} />
                      <Metric icon="wallet-outline" label="Thanh toán kỳ này" value={formatVnd(data.summary.payments)} />
                      <Metric icon="trending-down" label="Tổng còn phải thu" value={formatVnd(data.summary.outstanding)} attention />
                      <Metric icon="account-group-outline" label="Người còn nợ" value={String(data.summary.debtorCount)} />
                      <Metric icon="calendar-outline" label="Tổng tiền sân" value={formatVnd(data.courtMaterial.courtCost)} />
                      <Metric icon="package-variant-closed" label="Tổng tiền vật tư" value={formatVnd(data.courtMaterial.materialCost)} />
                    </View>
                    <FinanceTrend rows={trends.data} loading={trends.loading} error={trends.error} onRetry={() => void trends.reload()} />
                    <CostInsight rows={data.sessions} />
                    <ReportList title="Chi phí theo lịch đánh" subtitle={`${data.sessions.length} lịch đánh trong kỳ`} rows={data.sessions} rowKey={(row) => row.sessionId}
                      sortOptions={[
                        { value: 'time', label: 'Thời gian', compare: (a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc) },
                        { value: 'cost', label: 'Tổng chi', compare: (a, b) => a.totalCost - b.totalCost },
                        { value: 'participants', label: 'Số người', compare: (a, b) => a.participants - b.participants },
                        { value: 'title', label: 'Tên buổi', compare: (a, b) => a.title.localeCompare(b.title, 'vi') },
                      ]}
                      renderRow={(row) => <SessionRow row={row} />} />
                    <ReportList title="Thanh toán theo thời gian" subtitle={`${data.payments.length} giao dịch phù hợp`} rows={data.payments} rowKey={(row) => row.paymentId}
                      sortOptions={[
                        { value: 'date', label: 'Ngày thanh toán', compare: (a, b) => a.paymentDate.localeCompare(b.paymentDate) },
                        { value: 'amount', label: 'Số tiền', compare: (a, b) => a.amount - b.amount },
                        { value: 'player', label: 'Người chơi', compare: (a, b) => a.playerName.localeCompare(b.playerName, 'vi') },
                      ]}
                      renderRow={(row) => <PaymentRow row={row} />} />
                    <ReportList title="Công nợ người chơi" subtitle={`${data.debts.length} hồ sơ còn số dư`} rows={data.debts} rowKey={(row) => row.playerId}
                      sortOptions={[
                        { value: 'outstanding', label: 'Còn nợ', compare: (a, b) => a.outstanding - b.outstanding },
                        { value: 'charges', label: 'Tổng phát sinh', compare: (a, b) => a.totalCharges - b.totalCharges },
                        { value: 'player', label: 'Người chơi', compare: (a, b) => a.playerName.localeCompare(b.playerName, 'vi') },
                      ]}
                      renderRow={(row) => <DebtRow row={row} />} />
                  </>
                )}
                {tab === 'participation' && (
                  <>
                    <ParticipationInsight rows={data.participation} />
                    <ReportList title="Số lịch đánh & số trận" subtitle={playerId ? 'Đang lọc một người chơi' : `${data.participation.length} người chơi`} rows={data.participation} rowKey={(row) => row.playerId}
                      sortOptions={[
                        { value: 'present', label: 'Số lịch đánh', compare: (a, b) => a.present - b.present },
                        { value: 'games', label: 'Số trận đã đánh', compare: (a, b) => a.gamesPlayed - b.gamesPlayed },
                        { value: 'wins', label: 'Số trận thắng', compare: (a, b) => a.gamesWon - b.gamesWon },
                        { value: 'player', label: 'Người chơi', compare: (a, b) => a.playerName.localeCompare(b.playerName, 'vi') },
                      ]}
                      renderRow={(row) => <ParticipationRow row={row} />} />
                  </>
                )}
                {tab === 'inventory' && (
                  <>
                    <ReportList title="Vật tư dùng theo lịch đánh" subtitle={`${data.materials.length} dòng xuất dùng còn hiệu lực`} rows={data.materials} rowKey={(row, index) => `${row.sessionId}-${row.itemCode}-${index}`}
                      sortOptions={[
                        { value: 'date', label: 'Thời gian lịch đánh', compare: (a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc) },
                        { value: 'value', label: 'Giá trị', compare: (a, b) => a.value - b.value },
                        { value: 'quantity', label: 'Số lượng', compare: (a, b) => a.quantity - b.quantity },
                      ]}
                      renderRow={(row) => <MaterialRow row={row} />} />
                    <ReportList title="Nhập, xuất & tồn kho" subtitle={`${data.inventory.filter((row) => row.isLowStock).length} mặt hàng cần bổ sung`} rows={data.inventory} rowKey={(row) => row.itemId}
                      sortOptions={[
                        { value: 'name', label: 'Tên vật tư', compare: (a, b) => a.name.localeCompare(b.name, 'vi') },
                        { value: 'stock', label: 'Số lượng tồn', compare: (a, b) => a.stockOnHand - b.stockOnHand },
                        { value: 'value', label: 'Giá trị tồn', compare: (a, b) => a.stockValue - b.stockValue },
                      ]}
                      renderRow={(row) => <InventoryRow row={row} />} />
                  </>
                )}
              </>
            )}
      </ScrollView>
      <PlayerPicker visible={pickingPlayer} players={players} selectedId={playerId} onClose={() => setPickingPlayer(false)} onPick={(id) => { setPlayerId(id); setPickingPlayer(false) }} />
    </View>
  )
}

// ---------- Các khối thống kê ----------

function FinanceTrend({ rows, loading, error, onRetry }: { rows: { year: number; month: number; payments: number; costs: number }[] | null; loading: boolean; error: string | null; onRetry: () => void }) {
  const list = rows ?? []
  const max = Math.max(1, ...list.flatMap((row) => [Math.abs(row.payments), Math.abs(row.costs)]))
  return (
    <>
      <SectionTitle>Thu và chi phí trong 6 tháng</SectionTitle>
      <Card style={{ gap: 10 }}>
        <Text style={ui.rowSub}>Toàn CLB · thu ròng theo ngày thanh toán; chi phí theo lịch đánh đã chốt. Không áp dụng bộ lọc.</Text>
        {loading ? <Loading label="Đang tổng hợp xu hướng…" /> : error ? <ErrorState message={error} onRetry={onRetry} /> : (
          <>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Legend color={colors.brandMid} label="Thu ròng" />
              <Legend color={colors.moneyLight} label="Chi phí đã chốt" />
            </View>
            {!list.some((row) => row.payments || row.costs) && <Text style={ui.rowSub}>Chưa có thanh toán hoặc chi phí đã chốt trong 6 tháng này.</Text>}
            {list.map((row) => (
              <View key={`${row.year}-${row.month}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ width: 54, fontSize: font.caption, color: colors.muted }}>{String(row.month).padStart(2, '0')}/{row.year}</Text>
                <View style={{ flex: 1, gap: 3 }}>
                  <TrendBar value={row.payments} max={max} color={colors.brandMid} />
                  <TrendBar value={row.costs} max={max} color={colors.moneyLight} />
                </View>
              </View>
            ))}
          </>
        )}
      </Card>
    </>
  )
}

function TrendBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.bg }}>
        <View style={{ height: 10, borderRadius: 5, width: `${Math.round((Math.abs(value) / max) * 100)}%`, backgroundColor: value < 0 ? colors.danger : color }} />
      </View>
      <Text style={{ width: 96, textAlign: 'right', fontSize: font.caption, color: value < 0 ? colors.danger : colors.ink }}>{formatVnd(value)}</Text>
    </View>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: font.caption, color: colors.ink }}>{label}</Text>
    </View>
  )
}

function CostInsight({ rows }: { rows: SessionReportRow[] }) {
  const charged = rows.filter((row) => row.totalCost > 0)
  const average = charged.length ? Math.round(charged.reduce((total, row) => total + row.totalCost, 0) / charged.length) : 0
  return (
    <Insight title="Chi phí bình quân mỗi lịch đánh" value={charged.length ? formatVnd(average) : '—'}
      text={charged.length ? `${charged.length} lịch đánh có chi phí trong bộ lọc hiện tại; gồm cả chi phí chưa chốt.` : 'Chưa có buổi phát sinh chi phí trong bộ lọc này.'} />
  )
}

function ParticipationInsight({ rows }: { rows: ParticipationReportRow[] }) {
  const sessions = rows.reduce((total, row) => total + row.present, 0)
  const games = rows.reduce((total, row) => total + row.gamesPlayed, 0)
  const active = rows.filter((row) => row.present > 0).length
  return (
    <Insight title="Lượt chơi trong kỳ" value={sessions ? String(sessions) : '—'}
      text={sessions ? `${active} người chơi, ${sessions} lượt đi đánh, ${games} lượt ra sân thi đấu theo bộ lọc hiện tại.` : 'Chưa có người chơi nào được chọn vào lịch đánh trong kỳ này.'} />
  )
}

function Insight({ title, value, text }: { title: string; value: string; text: string }) {
  return (
    <Card style={{ marginTop: 12, gap: 4 }}>
      <Text style={{ fontSize: font.small, color: colors.muted }}>{title}</Text>
      <Text style={{ fontSize: font.big, fontWeight: '700', color: colors.ink }}>{value}</Text>
      <Text style={ui.rowSub}>{text}</Text>
    </Card>
  )
}

function Metric({ icon, label, value, attention }: { icon: IconName; label: string; value: string; attention?: boolean }) {
  return (
    <View style={[styles.metric, attention && { backgroundColor: colors.liveSoft }]}>
      <Icon name={icon} size={18} color={attention ? colors.live : colors.moneyMid} />
      <Text style={{ fontSize: font.caption, color: colors.muted, marginTop: 4 }}>{label}</Text>
      <Text style={{ fontSize: 17, fontWeight: '700', color: attention ? colors.liveDark : colors.ink }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  )
}

// ---------- Danh sách có sắp xếp, mỗi lần hiện thêm 8 dòng ----------

type SortOption<T> = { value: string; label: string; compare: (left: T, right: T) => number }
const PAGE = 8

function ReportList<T>({ title, subtitle, rows, rowKey, sortOptions, renderRow }: { title: string; subtitle: string; rows: T[]; rowKey: (row: T, index: number) => string; sortOptions: SortOption<T>[]; renderRow: (row: T) => ReactNode }) {
  const [sortValue, setSortValue] = useState(sortOptions[0].value)
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc')
  const [count, setCount] = useState(PAGE)
  const sorted = useMemo(() => {
    const option = sortOptions.find((item) => item.value === sortValue) ?? sortOptions[0]
    return [...rows].sort((left, right) => option.compare(left, right) * (direction === 'asc' ? 1 : -1))
  }, [rows, sortOptions, sortValue, direction])
  const shown = sorted.slice(0, count)
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <Card style={{ paddingVertical: 10 }}>
        <Text style={ui.rowSub}>{subtitle}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 8 }}>
          {sortOptions.map((option) => <Toggle key={option.value} small label={option.label} active={sortValue === option.value} onPress={() => { setSortValue(option.value); setCount(PAGE) }} />)}
          <Toggle small label={direction === 'asc' ? 'Tăng dần ↑' : 'Giảm dần ↓'} active={false} onPress={() => { setDirection((value) => value === 'asc' ? 'desc' : 'asc'); setCount(PAGE) }} />
        </ScrollView>
        {shown.length === 0 ? <Text style={[ui.rowSub, { paddingVertical: 10 }]}>Chưa có dữ liệu phù hợp.</Text>
          : shown.map((row, index) => <View key={rowKey(row, index)} style={[ui.row, index === shown.length - 1 && { borderBottomWidth: 0 }]}>{renderRow(row)}</View>)}
        {sorted.length > count && <Button label={`Xem thêm (${sorted.length - count} dòng)`} tone="outline" onPress={() => setCount((value) => value + PAGE)} style={{ marginTop: 6 }} />}
      </Card>
    </>
  )
}

function SessionRow({ row }: { row: SessionReportRow }) {
  const meta = statusMeta[row.status]
  return (
    <>
      <View style={{ flex: 1 }}>
        <Text style={ui.rowTitle} numberOfLines={1}>{row.code} · {row.title}</Text>
        <Text style={ui.rowSub} numberOfLines={1}>{formatDateTime(row.startsAtUtc)} · {row.venueName}</Text>
        <Chip label={meta.label} bg={meta.bg} fg={meta.fg} style={{ marginTop: 4, paddingVertical: 2 }} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.amount}>{formatVnd(row.totalCost)}</Text>
        <Text style={ui.rowSub}>{row.participants} người · BQ {formatVnd(row.costPerPerson)}</Text>
      </View>
    </>
  )
}

function PaymentRow({ row }: { row: PaymentReportRow }) {
  return (
    <>
      <View style={{ flex: 1 }}>
        <Text style={ui.rowTitle} numberOfLines={1}>{row.playerName}</Text>
        <Text style={ui.rowSub}>{formatDay(row.paymentDate)} · {row.method}</Text>
      </View>
      <Text style={[styles.amount, { color: row.amount >= 0 ? colors.ok : colors.danger }]}>{formatVnd(row.amount)}</Text>
    </>
  )
}

function DebtRow({ row }: { row: PlayerDebtReportRow }) {
  return (
    <>
      <View style={{ flex: 1 }}>
        <Text style={ui.rowTitle} numberOfLines={1}>{row.playerName}</Text>
        <Text style={ui.rowSub}>{row.memberCode} · phát sinh {formatVnd(row.totalCharges)} · đã trả {formatVnd(row.totalPaid)}</Text>
      </View>
      <Text style={[styles.amount, { color: colors.danger }]}>{formatVnd(row.outstanding)}</Text>
    </>
  )
}

function ParticipationRow({ row }: { row: ParticipationReportRow }) {
  return (
    <>
      <View style={{ flex: 1 }}>
        <Text style={ui.rowTitle} numberOfLines={1}>{row.playerName}</Text>
        <Text style={ui.rowSub}>{row.memberCode} · {row.present} lịch đánh · {row.gamesPlayed} trận · {row.gamesWon} thắng</Text>
      </View>
      <Text style={styles.amount}>{row.gamesPlayed ? `${Math.round((row.gamesWon / row.gamesPlayed) * 100)}%` : '—'}</Text>
    </>
  )
}

function MaterialRow({ row }: { row: SessionMaterialReportRow }) {
  return (
    <>
      <View style={{ flex: 1 }}>
        <Text style={ui.rowTitle} numberOfLines={1}>{row.itemCode} · {row.itemName}</Text>
        <Text style={ui.rowSub}>{row.sessionCode} · {formatDateTime(row.startsAtUtc)} · SL {row.quantity}</Text>
      </View>
      <Text style={styles.amount}>{formatVnd(row.value)}</Text>
    </>
  )
}

function InventoryRow({ row }: { row: InventoryReportRow }) {
  return (
    <>
      <View style={{ flex: 1 }}>
        <Text style={ui.rowTitle} numberOfLines={1}>{row.code} · {row.name}</Text>
        <Text style={ui.rowSub}>Tồn <Text style={{ color: row.isLowStock ? colors.danger : colors.ink, fontWeight: '600' }}>{row.stockOnHand}</Text> · tối thiểu {row.minimumStock}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={styles.amount}>{formatVnd(row.stockValue)}</Text>
        {row.isLowStock && <Chip label="Cần bổ sung" bg={colors.warnSoft} fg={colors.warnDark} />}
      </View>
    </>
  )
}

// ---------- Điều khiển nhỏ ----------

function PlayerPicker({ visible, players, selectedId, onClose, onPick }: { visible: boolean; players: { id: string; memberCode: string; fullName: string }[]; selectedId: string; onClose: () => void; onPick: (id: string) => void }) {
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState('')
  const term = normalize(search)
  const list = term ? players.filter((player) => normalize(`${player.memberCode} ${player.fullName}`).includes(term)) : players
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ flex: 1, fontSize: font.title, fontWeight: '700', color: colors.ink }}>Chọn người chơi</Text>
            <IconButton icon="close" label="Đóng" onPress={onClose} />
          </View>
          <View style={styles.searchBox}>
            <Icon name="magnify" color={colors.muted} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Tìm tên hoặc mã" placeholderTextColor={colors.muted} style={{ flex: 1, minHeight: 44, fontSize: font.body, color: colors.ink }} />
          </View>
          <FlatList
            data={[{ id: '', memberCode: '', fullName: 'Tất cả người chơi' }, ...list]}
            keyExtractor={(player) => player.id || 'all'}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable onPress={() => onPick(item.id)} style={({ pressed }) => [styles.pickRow, { opacity: pressed ? 0.8 : 1 }]}>
                <Text style={{ flex: 1, fontSize: font.body, color: colors.ink }}>{item.memberCode ? `${item.memberCode} · ` : ''}{item.fullName}</Text>
                {selectedId === item.id && <Icon name="check" color={colors.brand} />}
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  )
}

function Toggle({ label, active, onPress, small }: { label: string; active: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
      style={[styles.toggle, small && { paddingHorizontal: 12 }, { backgroundColor: active ? colors.brand : '#fff', borderColor: active ? colors.brand : colors.line }]}>
      <Text style={{ fontSize: small ? font.small : font.body, color: active ? '#fff' : colors.ink, fontWeight: active ? '600' : '400' }}>{label}</Text>
    </Pressable>
  )
}

function IconButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.7 : 1 }]}>
      <Icon name={icon} size={24} color={colors.brand} />
    </Pressable>
  )
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` }
}
function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split('-').map(Number)
  const value = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`
}
function formatDay(value: string) { const [year, month, day] = value.split('-'); return `${day}/${month}/${year}` }
const formatDateTime = (value: string) => `${formatWeekdayDate(value)} ${formatTime(value)}`
function normalize(value: string) { return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim() }

const styles = StyleSheet.create({
  monthBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 16, padding: 8, marginHorizontal: 16, marginTop: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  filterToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.brandSoft },
  label: { fontSize: font.small, color: colors.muted, fontWeight: '500' },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  toggle: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, backgroundColor: colors.card, borderRadius: 12, padding: 4 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: colors.brandSoft },
  note: { fontSize: font.caption, color: colors.muted, marginHorizontal: 16, marginTop: 8 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  metric: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 14, padding: 12 },
  amount: { fontSize: font.body, fontWeight: '700', color: colors.ink },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', paddingTop: 8, gap: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, marginHorizontal: 16 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
})
