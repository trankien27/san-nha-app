import { router, Stack, type Href } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useAuth } from '@/auth/AuthContext'
import { bangkokToday, skillLabel } from '@/lib/format'
import { getGameStats, type GameFormTrend, type PlayerGameStats } from '@/lib/services/reports'
import { useLoad } from '@/lib/useLoad'
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Icon, Loading, type IconName } from '@/ui/components'
import { colors, font } from '@/ui/theme'

type Preset = '7d' | '30d' | 'month' | 'custom'
type SortKey = 'wins' | 'winRate' | 'played' | 'form' | 'minutes'
const presetLabels: Record<Preset, string> = { '7d': '7 ngày', '30d': '30 ngày', month: 'Tháng này', custom: 'Tùy chọn' }
const sortLabels: Record<SortKey, string> = { wins: 'Số trận thắng', winRate: 'Tỉ lệ thắng', played: 'Số trận', form: 'Phong độ gần đây', minutes: 'Thời gian trên sân' }
const trendMeta: Record<GameFormTrend, { label: string; icon?: IconName; bg: string; fg: string }> = {
  up: { label: 'Đang lên', icon: 'arrow-top-right', bg: colors.okSoft, fg: colors.ok },
  steady: { label: 'Ổn định', icon: 'arrow-right', bg: colors.neutralSoft, fg: colors.neutral },
  down: { label: 'Đi xuống', icon: 'arrow-bottom-right', bg: colors.dangerSoft, fg: colors.danger },
  notEnoughData: { label: 'Chưa đủ trận', bg: colors.neutralSoft, fg: colors.muted },
}

/** Bảng thắng/thua các trận đã kết thúc trong "Chia trận"; chạm một người để xem phân tích phong độ. */
export default function GameStatsScreen() {
  const roles = useAuth().user?.roles ?? []
  const allowed = roles.includes('ADMIN') || roles.includes('ORGANIZER')
  return (
    <>
      <Stack.Screen options={{ title: 'Thống kê trận' }} />
      {allowed ? <GameStats /> : <EmptyState icon="lock-outline" title="Bạn không có quyền xem thống kê trận" message="Chỉ Quản trị và Hỗ trợ xem được mục này." />}
    </>
  )
}

function GameStats() {
  const [preset, setPreset] = useState<Preset>('month')
  const [range, setRange] = useState(() => presetRange('month'))
  const [customFrom, setCustomFrom] = useState(() => formatDay(range.from))
  const [customTo, setCustomTo] = useState(() => formatDay(range.to))
  const [customError, setCustomError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('wins')

  const { data, error, loading, refreshing, reload } = useLoad(() => getGameStats(range.from, range.to), `${range.from}|${range.to}`)
  const rows = useMemo(() => data ?? [], [data])

  const visible = useMemo(() => {
    const term = normalize(search)
    const filtered = term ? rows.filter((row) => normalize(row.name).includes(term)) : rows
    const value = (row: PlayerGameStats) => sort === 'wins' ? row.wins : sort === 'winRate' ? row.winRate : sort === 'played' ? row.played : sort === 'form' ? row.recentWinRate : row.minutesPlayed
    return [...filtered].sort((a, b) => value(b) - value(a) || b.wins - a.wins || a.name.localeCompare(b.name, 'vi'))
  }, [rows, search, sort])

  const totals = useMemo(() => {
    const leader = [...rows].sort((a, b) => b.wins - a.wins || b.winRate - a.winRate)[0]
    const hot = rows.filter((row) => row.played >= 3).sort((a, b) => b.recentWinRate - a.recentWinRate || b.streak - a.streak)[0]
    // Mỗi trận đơn có 2 người, trận đôi 4 người: quy về số trận thật.
    const games = Math.round(rows.reduce((total, row) => total + row.singlesPlayed / 2 + row.doublesPlayed / 4, 0))
    return { leader, hot, games }
  }, [rows])

  const choosePreset = (value: Preset) => {
    setPreset(value)
    setCustomError(null)
    if (value !== 'custom') setRange(presetRange(value))
  }
  const applyCustom = () => {
    const from = parseDay(customFrom)
    const to = parseDay(customTo)
    if (!from || !to) { setCustomError('Nhập ngày theo dạng dd/mm/yyyy.'); return }
    if (to < from) { setCustomError('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.'); return }
    setCustomError(null)
    setRange({ from, to })
  }
  const open = (row: PlayerGameStats) => {
    // Typed routes chỉ sinh lại khi chạy expo start; ép kiểu để route mới không làm tsc báo lỗi trước lúc đó.
    router.push({ pathname: '/thong-ke/[key]', params: { key: row.key, from: range.from, to: range.to, name: row.name } } as unknown as Href)
  }

  const header = (
    <View style={{ gap: 10, paddingTop: 12, paddingBottom: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {(Object.keys(presetLabels) as Preset[]).map((value) => (
          <Toggle key={value} label={presetLabels[value]} active={preset === value} onPress={() => choosePreset(value)} />
        ))}
      </ScrollView>
      {preset === 'custom' && (
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <DateField label="Từ ngày" value={customFrom} onChange={(text) => { setCustomFrom(text); setCustomError(null) }} />
            <DateField label="Đến ngày" value={customTo} onChange={(text) => { setCustomTo(text); setCustomError(null) }} />
          </View>
          {customError && <Text style={{ color: colors.danger, fontSize: font.small }}>{customError}</Text>}
          <Button label="Xem thống kê" icon="magnify" onPress={applyCustom} />
        </Card>
      )}
      <Text style={styles.note}>{formatDay(range.from)} – {formatDay(range.to)} · trận bỏ không tính · chạm một người để xem phong độ</Text>
      <View style={styles.searchBox}>
        <Icon name="magnify" color={colors.muted} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Tìm người chơi…" placeholderTextColor={colors.muted} style={styles.searchInput} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {(Object.keys(sortLabels) as SortKey[]).map((value) => (
          <Toggle key={value} label={sortLabels[value]} active={sort === value} onPress={() => setSort(value)} small />
        ))}
      </ScrollView>
      {rows.length > 0 && (
        <View style={styles.tiles}>
          <Highlight icon="sword-cross" value={String(totals.games)} label="trận đã kết thúc" />
          <Highlight icon="account-group-outline" value={String(rows.length)} label="người đã ra sân" />
          <Highlight icon="trophy-outline" value={totals.leader?.name ?? '—'} label={totals.leader ? `thắng nhiều nhất · ${totals.leader.wins} trận` : 'chưa có'} />
          <Highlight icon="trending-up" value={totals.hot?.name ?? '—'} label={totals.hot ? `phong độ tốt nhất · ${totals.hot.recentWinRate}% gần đây` : 'cần ít nhất 3 trận'} />
        </View>
      )}
    </View>
  )

  return (
    <FlatList
      data={loading || error ? [] : visible}
      keyExtractor={(row) => row.key}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor={colors.brand} />}
      ListHeaderComponent={header}
      ListEmptyComponent={
        loading ? <Loading label="Đang tổng hợp thống kê…" />
          : error ? <ErrorState message={error} onRetry={() => void reload()} />
            : rows.length === 0 ? <EmptyState icon="sword-cross" title="Chưa có trận nào kết thúc" message="Vào Lịch đánh → Chia trận, ghi tỉ số và bấm Kết thúc để có thống kê." />
              : <EmptyState icon="account-search-outline" title={`Không có ai khớp "${search}"`} />
      }
      renderItem={({ item, index }) => <StatsCard row={item} rank={index + 1} onPress={() => open(item)} />}
    />
  )
}

function StatsCard({ row, rank, onPress }: { row: PlayerGameStats; rank: number; onPress: () => void }) {
  const diffColor = row.averagePointDiff > 0 ? colors.ok : row.averagePointDiff < 0 ? colors.danger : colors.ink
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Phong độ của ${row.name}`} onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[styles.rank, rank <= 3 && { backgroundColor: rankColors[rank - 1] }]}>
          <Text style={{ fontSize: font.small, fontWeight: '700', color: rank <= 3 ? colors.warnDark : colors.muted }}>{rank}</Text>
        </View>
        <Avatar name={row.name} seed={row.key} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.body, fontWeight: '600', color: colors.ink }} numberOfLines={1}>{row.name}</Text>
          <Text style={{ fontSize: font.caption, color: colors.muted }}>{row.isGuest ? 'Khách' : 'Thành viên'}{row.skillRating ? ` · ${skillLabel(row.skillRating)}` : ''}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.ink }}><Text style={{ color: colors.ok }}>{row.wins}</Text>–{row.losses}</Text>
          <Text style={{ fontSize: font.caption, color: colors.muted }}>{row.played} trận</Text>
        </View>
      </View>
      <WinBar value={row.winRate} />
      <View style={styles.metaRow}>
        <Meta label="Đơn" value={row.singlesPlayed ? `${row.singlesWins}/${row.singlesPlayed}` : '—'} />
        <Meta label="Đôi" value={row.doublesPlayed ? `${row.doublesWins}/${row.doublesPlayed}` : '—'} />
        <Meta label="Hiệu số TB" value={signed(row.averagePointDiff)} color={diffColor} />
        <Meta label="Thời gian" value={formatMinutes(row.minutesPlayed)} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: font.caption, color: colors.muted }}>5 trận gần nhất</Text>
          <FormChips form={row.recentForm} />
        </View>
        <TrendBadge trend={row.trend} />
      </View>
    </Pressable>
  )
}

const rankColors = ['#FAC775', '#E6EBE8', '#F5C4B3']

function Toggle({ label, active, onPress, small }: { label: string; active: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
      style={[styles.toggle, small && { paddingHorizontal: 12 }, { backgroundColor: active ? colors.brand : '#fff', borderColor: active ? colors.brand : colors.line }]}>
      <Text style={{ fontSize: small ? font.small : font.body, color: active ? '#fff' : colors.ink, fontWeight: active ? '600' : '400' }}>{label}</Text>
    </Pressable>
  )
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (text: string) => void }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ fontSize: font.caption, color: colors.muted }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder="dd/mm/yyyy" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" maxLength={10} style={styles.dateInput} />
    </View>
  )
}

function Highlight({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Icon name={icon} size={18} color={colors.brandMid} />
      <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.ink, marginTop: 4 }} numberOfLines={1}>{value}</Text>
      <Text style={{ fontSize: font.caption, color: colors.muted }} numberOfLines={2}>{label}</Text>
    </View>
  )
}

function Meta({ label, value, color = colors.ink }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: font.caption, color: colors.muted }}>{label}</Text>
      <Text style={{ fontSize: font.small, fontWeight: '600', color }}>{value}</Text>
    </View>
  )
}

function WinBar({ value }: { value: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, Math.max(0, value))}%` }]} /></View>
      <Text style={{ fontSize: font.small, fontWeight: '600', color: colors.ink, minWidth: 40, textAlign: 'right' }}>{value}%</Text>
    </View>
  )
}

function FormChips({ form }: { form: string }) {
  if (!form) return <Text style={{ fontSize: font.small, color: colors.muted }}>—</Text>
  return (
    <View style={{ flexDirection: 'row', gap: 3 }} accessibilityLabel={`Gần nhất trước: ${[...form].map((c) => c === 'T' ? 'thắng' : 'thua').join(', ')}`}>
      {[...form].map((result, index) => (
        <View key={index} style={[styles.formChip, { backgroundColor: result === 'T' ? colors.okSoft : colors.dangerSoft }]}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: result === 'T' ? colors.ok : colors.danger }}>{result}</Text>
        </View>
      ))}
    </View>
  )
}

function TrendBadge({ trend }: { trend: GameFormTrend }) {
  const meta = trendMeta[trend]
  return <Chip label={meta.label} icon={meta.icon} bg={meta.bg} fg={meta.fg} />
}

function presetRange(preset: Exclude<Preset, 'custom'>) {
  const today = bangkokToday()
  if (preset === '7d') return { from: addDays(today, -6), to: today }
  if (preset === '30d') return { from: addDays(today, -29), to: today }
  return { from: `${today.slice(0, 8)}01`, to: today }
}
function addDays(day: string, days: number) {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}
/** dd/mm/yyyy → yyyy-MM-dd; null nếu không phải ngày có thật. */
function parseDay(text: string) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim())
  if (!match) return null
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const value = new Date(Date.UTC(year, month - 1, day))
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return null
  return value.toISOString().slice(0, 10)
}
function formatDay(value: string) { const [year, month, day] = value.split('-'); return `${day}/${month}/${year}` }
function signed(value: number) { const text = String(Math.round(value * 10) / 10).replace('.', ','); return value > 0 ? `+${text}` : text }
function formatMinutes(minutes: number) { if (!minutes) return '—'; const hours = Math.floor(minutes / 60); return hours ? `${hours} giờ ${minutes % 60 ? `${minutes % 60} phút` : ''}`.trim() : `${minutes} phút` }
function normalize(value: string) { return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim() }

const styles = StyleSheet.create({
  chipRow: { gap: 8, paddingHorizontal: 16 },
  toggle: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: font.small, color: colors.muted, marginHorizontal: 16 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, marginHorizontal: 16 },
  searchInput: { flex: 1, minHeight: 44, fontSize: font.body, color: colors.ink },
  dateInput: { minHeight: 44, backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 12, fontSize: font.body, color: colors.ink },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  tile: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 14, padding: 12 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 14, marginHorizontal: 16, marginBottom: 10, gap: 10 },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', gap: 8 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.bg },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.brandMid },
  formChip: { width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
})
