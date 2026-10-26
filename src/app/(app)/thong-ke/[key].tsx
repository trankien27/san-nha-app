import { Stack, useLocalSearchParams } from 'expo-router'
import type { ReactNode } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/auth/AuthContext'
import { bangkokToday, courtLetter, formatTime, formatWeekdayDate } from '@/lib/format'
import { getPlayerForm, type GameFormTrend, type PlayerGameHistoryItem, type PlayerPairStat } from '@/lib/services/reports'
import { useLoad } from '@/lib/useLoad'
import { Card, Chip, EmptyState, ErrorState, Icon, Loading, SectionTitle, styles as ui, type IconName } from '@/ui/components'
import { colors, font } from '@/ui/theme'

const trendMeta: Record<GameFormTrend, { label: string; icon?: IconName; bg: string; fg: string }> = {
  up: { label: 'Đang lên', icon: 'arrow-top-right', bg: colors.okSoft, fg: colors.ok },
  steady: { label: 'Ổn định', icon: 'arrow-right', bg: colors.neutralSoft, fg: colors.neutral },
  down: { label: 'Đi xuống', icon: 'arrow-bottom-right', bg: colors.dangerSoft, fg: colors.danger },
  notEnoughData: { label: 'Chưa đủ trận', bg: colors.neutralSoft, fg: colors.muted },
}

/** Phân tích phong độ một người trong khoảng ngày đã chọn ở bảng thắng/thua. */
export default function PlayerFormScreen() {
  const params = useLocalSearchParams<{ key: string; from?: string; to?: string; name?: string }>()
  const roles = useAuth().user?.roles ?? []
  const allowed = roles.includes('ADMIN') || roles.includes('ORGANIZER')
  return (
    <>
      <Stack.Screen options={{ title: params.name ? `Phong độ · ${params.name}` : 'Phong độ' }} />
      {allowed ? <PlayerForm playerKey={params.key} from={params.from} to={params.to} /> : <EmptyState icon="lock-outline" title="Bạn không có quyền xem thống kê trận" message="Chỉ Quản trị và Hỗ trợ xem được mục này." />}
    </>
  )
}

function PlayerForm({ playerKey, from: fromParam, to: toParam }: { playerKey: string; from?: string; to?: string }) {
  const today = bangkokToday()
  const from = isDay(fromParam) ? fromParam : `${today.slice(0, 8)}01`
  const to = isDay(toParam) ? toParam : today
  const { data, error, loading, refreshing, reload } = useLoad(() => getPlayerForm(playerKey, from, to), `${playerKey}|${from}|${to}`)

  if (loading) return <Loading label="Đang phân tích phong độ…" />
  if (error || !data) return <ErrorState message={error ?? 'Không thể tải phân tích phong độ.'} onRetry={() => void reload()} />

  const summary = data.summary
  const trend = trendMeta[summary.trend]
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor={colors.brand} />}>
      <Text style={styles.note}>{formatDay(from)} – {formatDay(to)} · {summary.isGuest ? 'Khách vãng lai' : 'Thành viên'}</Text>

      <View style={styles.grid}>
        <Metric label="Thắng / thua" value={`${summary.wins}–${summary.losses}`} sub={`${summary.winRate}% · ${summary.played} trận`} />
        <Metric label={`${summary.recentForm.length} trận gần nhất`} value={`${summary.recentWinRate}%`}><FormChips form={summary.recentForm} /></Metric>
        <Metric label="Chuỗi hiện tại" value={summary.streak > 0 ? `${summary.streak} thắng` : `${-summary.streak} thua`} color={summary.streak > 0 ? colors.ok : colors.danger}>
          <Chip label={trend.label} icon={trend.icon} bg={trend.bg} fg={trend.fg} />
        </Metric>
        <Metric label="Điểm ghi / mất" value={`${summary.pointsFor}/${summary.pointsAgainst}`} sub={`Hiệu số TB ${signed(summary.averagePointDiff)}`} />
        <Metric label="Đơn · Đôi" value={`${summary.singlesWins}/${summary.singlesPlayed} · ${summary.doublesWins}/${summary.doublesPlayed}`} sub="thắng/trận" />
        <Metric label="Thời gian trên sân" value={formatMinutes(summary.minutesPlayed)} sub="tổng các trận có ghi thời lượng" />
      </View>

      <SectionTitle>Nhận xét</SectionTitle>
      <Card style={{ gap: 8 }}>
        {data.insights.length === 0 ? <Text style={ui.rowSub}>Chưa có nhận xét.</Text> : data.insights.map((text) => (
          <View key={text} style={{ flexDirection: 'row', gap: 8 }}>
            <Icon name="lightbulb-on-outline" size={16} color={colors.warn} />
            <Text style={{ flex: 1, fontSize: font.small, color: colors.ink }}>{text}</Text>
          </View>
        ))}
      </Card>

      <PairList title="Đánh cặp cùng" empty="Chưa đánh đôi." rows={data.partners} />
      <PairList title="Đối đầu" empty="Chưa có đối thủ." rows={data.opponents} />

      <SectionTitle>Các trận ({data.games.length}) · mới nhất trước</SectionTitle>
      {data.games.length === 0 ? <Card><EmptyState icon="sword-cross" title="Chưa có trận nào" /></Card> : data.games.map((game) => <GameCard key={game.gameId} game={game} />)}
    </ScrollView>
  )
}

function Metric({ label, value, sub, color = colors.ink, children }: { label: string; value: string; sub?: string; color?: string; children?: ReactNode }) {
  return (
    <View style={styles.metric}>
      <Text style={{ fontSize: font.caption, color: colors.muted }}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color, marginVertical: 2 }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub && <Text style={{ fontSize: font.caption, color: colors.muted }}>{sub}</Text>}
      {children}
    </View>
  )
}

function PairList({ title, empty, rows }: { title: string; empty: string; rows: PlayerPairStat[] }) {
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <Card style={{ paddingVertical: 4 }}>
        {rows.length === 0 ? <Text style={[ui.rowSub, { paddingVertical: 10 }]}>{empty}</Text> : rows.slice(0, 8).map((pair, index, list) => {
          const rate = Math.round((100 * pair.wins) / Math.max(1, pair.games))
          return (
            <View key={pair.name} style={[styles.pairRow, index === list.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: font.body, color: colors.ink }} numberOfLines={1}>{pair.name}</Text>
                <Text style={{ fontSize: font.small, color: colors.muted }}>{pair.wins}/{pair.games} thắng</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, rate)}%` }]} /></View>
                <Text style={{ fontSize: font.caption, fontWeight: '600', color: colors.ink, minWidth: 36, textAlign: 'right' }}>{rate}%</Text>
              </View>
            </View>
          )
        })}
      </Card>
    </>
  )
}

function GameCard({ game }: { game: PlayerGameHistoryItem }) {
  return (
    <Card style={{ marginBottom: 8, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontSize: font.caption, color: colors.muted, flex: 1 }} numberOfLines={1}>
          {formatWeekdayDate(game.playedAtUtc)} {formatTime(game.playedAtUtc)} · {game.sessionCode} · Sân {courtLetter(game.courtNo)} · {game.isSingles ? 'Đơn' : 'Đôi'}
        </Text>
        <Chip label={`${game.won ? 'Thắng' : 'Thua'} ${game.scoreFor}–${game.scoreAgainst}`} bg={game.won ? colors.okSoft : colors.dangerSoft} fg={game.won ? colors.ok : colors.danger} />
      </View>
      {!game.isSingles && <Text style={{ fontSize: font.small, color: colors.ink }}><Text style={{ color: colors.muted }}>Đồng đội: </Text>{game.partners.length ? game.partners.join(', ') : '—'}</Text>}
      <Text style={{ fontSize: font.small, color: colors.ink }}><Text style={{ color: colors.muted }}>Đối thủ: </Text>{game.opponents.join(', ') || '—'}</Text>
      <Text style={{ fontSize: font.caption, color: colors.muted }}>Thời lượng: {game.durationMinutes !== null ? `${game.durationMinutes} phút` : '—'}</Text>
    </Card>
  )
}

function FormChips({ form }: { form: string }) {
  if (!form) return <Text style={{ fontSize: font.small, color: colors.muted }}>—</Text>
  return (
    <View style={{ flexDirection: 'row', gap: 3, marginTop: 2 }} accessibilityLabel={`Gần nhất trước: ${[...form].map((c) => c === 'T' ? 'thắng' : 'thua').join(', ')}`}>
      {[...form].map((result, index) => (
        <View key={index} style={[styles.formChip, { backgroundColor: result === 'T' ? colors.okSoft : colors.dangerSoft }]}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: result === 'T' ? colors.ok : colors.danger }}>{result}</Text>
        </View>
      ))}
    </View>
  )
}

const isDay = (value: string | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
function formatDay(value: string) { const [year, month, day] = value.split('-'); return `${day}/${month}/${year}` }
function signed(value: number) { const text = String(Math.round(value * 10) / 10).replace('.', ','); return value > 0 ? `+${text}` : text }
function formatMinutes(minutes: number) { if (!minutes) return '—'; const hours = Math.floor(minutes / 60); return hours ? `${hours} giờ ${minutes % 60 ? `${minutes % 60} phút` : ''}`.trim() : `${minutes} phút` }

const styles = StyleSheet.create({
  note: { fontSize: font.small, color: colors.muted, marginHorizontal: 16, marginTop: 12, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  metric: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 14, padding: 12 },
  pairRow: { gap: 6, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.bg },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.brandMid },
  formChip: { width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
})
