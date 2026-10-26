import { Stack } from 'expo-router'
import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { usePermissions } from '@/auth/AuthContext'
import { formatVnd, formatWeekdayDate } from '@/lib/format'
import { currentMonth, getReconciliation, monthLabel, monthRange, shiftMonth, type SessionReconciliation } from '@/lib/services/finance'
import { useLoad } from '@/lib/useLoad'
import { Card, EmptyState, ErrorState, Icon, Loading, SectionTitle, styles as ui } from '@/ui/components'
import { colors, font } from '@/ui/theme'

const signed = (value: number) => `${value > 0 ? '+' : ''}${formatVnd(value)}`
const signColor = (value: number) => (value > 0 ? colors.ok : value < 0 ? colors.danger : colors.ink)

/**
 * Đối soát theo tháng: chi ra (tiền sân thực trả, giá nhập vật tư đã dùng) so với thu vào của các buổi đã chốt tiền.
 * Thu vào = phần phải thu sau miễn thu; phụ phí tính riêng, phần còn lại chia cho sân và vật tư theo tỉ lệ trong bảng tính tiền.
 */
export default function ReconciliationScreen() {
  const { canBill } = usePermissions()
  const [month, setMonth] = useState(currentMonth)
  const { data, error, loading, refreshing, reload } = useLoad(() => {
    if (!canBill) return Promise.resolve(null)
    const { from, to } = monthRange(month)
    return getReconciliation(from, to)
  }, month)

  const header = <Stack.Screen options={{ title: 'Đối soát' }} />
  if (!canBill) return <>{header}<EmptyState icon="lock-outline" title="Không có quyền xem đối soát" message="Chỉ Quản trị và Kế toán mới xem được phần tiền." /></>

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}>
        <MonthStepper value={month} onChange={setMonth} />
        {loading ? <Loading label="Đang đối soát…" /> : error || !data ? <ErrorState message={error ?? 'Không thể tải đối soát.'} onRetry={() => void reload()} />
          : data.sessions.length === 0 ? <EmptyState icon="scale-balance" title="Chưa có lịch đánh đã chốt tiền" message="Đối soát tính trên các lịch đánh đã chốt tiền trong tháng." /> : (
            <>
              <View style={[styles.summary, { backgroundColor: data.profit >= 0 ? colors.money : colors.danger }]}>
                <Text style={{ color: '#fff', opacity: 0.8, fontSize: font.small }}>Lãi/lỗ {data.sessions.length} buổi đã chốt</Text>
                <Text style={{ color: '#fff', fontSize: font.big, fontWeight: '700' }}>{signed(data.profit)}</Text>
                <Text style={{ color: '#fff', opacity: 0.8, fontSize: font.caption, marginTop: 4 }}>Chi ra {formatVnd(data.courtActual + data.materialCost)} · Thu vào {formatVnd(data.courtRevenue + data.materialRevenue + data.surchargeRevenue)}</Text>
              </View>

              <SectionTitle>Theo khoản</SectionTitle>
              <Card style={{ paddingVertical: 2 }}>
                <Part label="Sân" spent={data.courtActual} spentNote="thực trả" earned={data.courtRevenue} earnedNote={`niêm yết ${formatVnd(data.courtListed)}`} />
                <Part label="Vật tư" spent={data.materialCost} spentNote="giá nhập" earned={data.materialRevenue} earnedNote="giá xuất" last={data.surchargeRevenue <= 0} />
                {data.surchargeRevenue > 0 && <Part label="Phụ phí" spent={0} earned={data.surchargeRevenue} last />}
              </Card>

              <SectionTitle>Thu tiền</SectionTitle>
              <Card style={{ paddingVertical: 2 }}>
                <Line label="Phải thu (đã trừ miễn thu)" value={formatVnd(data.receivable)} />
                <Line label="Đã thu" value={formatVnd(data.collected)} color={colors.ok} />
                <Line label="Còn nợ" value={formatVnd(data.outstanding)} color={data.outstanding > 0 ? colors.danger : colors.ink} />
                <Line label="Miễn thu" value={formatVnd(data.exempt)} last />
              </Card>
              <Text style={styles.note}>Tiền chia cho người chơi theo giá sân niêm yết; tiền sân thực trả để trống thì bằng giá niêm yết.</Text>

              <SectionTitle>Từng buổi</SectionTitle>
              {data.sessions.map((row) => <SessionRow key={row.playSessionId} row={row} />)}
            </>
          )}
      </ScrollView>
    </>
  )
}

function Part({ label, spent, spentNote, earned, earnedNote, last }: { label: string; spent: number; spentNote?: string; earned: number; earnedNote?: string; last?: boolean }) {
  const diff = earned - spent
  return (
    <View style={[styles.part, last && { borderBottomWidth: 0 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[ui.rowTitle, { flex: 1, fontWeight: '600' }]}>{label}</Text>
        <Text style={{ fontSize: font.body, fontWeight: '700', color: signColor(diff) }}>{signed(diff)}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
        <Text style={[ui.rowSub, { flex: 1 }]}>Chi {formatVnd(spent)}{spentNote ? ` (${spentNote})` : ''}</Text>
        <Text style={[ui.rowSub, { flex: 1, textAlign: 'right' }]}>Thu {formatVnd(earned)}{earnedNote ? `\n${earnedNote}` : ''}</Text>
      </View>
    </View>
  )
}

function Line({ label, value, color = colors.ink, last }: { label: string; value: string; color?: string; last?: boolean }) {
  return (
    <View style={[ui.row, last && { borderBottomWidth: 0 }]}>
      <Text style={[ui.rowTitle, { flex: 1 }]}>{label}</Text>
      <Text style={{ fontSize: font.body, color, fontWeight: '600' }}>{value}</Text>
    </View>
  )
}

function SessionRow({ row }: { row: SessionReconciliation }) {
  const cells: [string, string][] = [
    ['Sân thực trả', `${formatVnd(row.courtActual)}${row.courtActual !== row.courtListed ? ` (niêm yết ${formatVnd(row.courtListed)})` : ''}`],
    ['Sân thu', formatVnd(row.courtRevenue)],
    ['Vật tư vốn', formatVnd(row.materialCost)],
    ['Vật tư thu', formatVnd(row.materialRevenue)],
    ...(row.surchargeRevenue > 0 ? [['Phụ phí', formatVnd(row.surchargeRevenue)] as [string, string]] : []),
    ...(row.exempt > 0 ? [['Miễn thu', formatVnd(row.exempt)] as [string, string]] : []),
    ['Đã thu', formatVnd(row.collected)],
    ['Còn nợ', formatVnd(row.outstanding)],
  ]
  return (
    <Card style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={[ui.rowTitle, { fontWeight: '600' }]}>{row.sessionTitle}</Text>
          <Text style={ui.rowSub}>{row.sessionCode} · {formatWeekdayDate(row.startsAtUtc)}</Text>
        </View>
        <Text style={{ fontSize: font.body, fontWeight: '700', color: signColor(row.profit) }}>{signed(row.profit)}</Text>
      </View>
      <View style={styles.grid}>
        {cells.map(([label, value]) => (
          <View key={label} style={styles.cell}>
            <Text style={{ fontSize: font.caption, color: colors.muted }}>{label}</Text>
            <Text style={{ fontSize: font.small, color: label === 'Còn nợ' && row.outstanding > 0 ? colors.danger : colors.ink }}>{value}</Text>
          </View>
        ))}
      </View>
    </Card>
  )
}

function MonthStepper({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const isCurrent = value === currentMonth()
  return (
    <View style={styles.stepper}>
      <Pressable accessibilityLabel="Tháng trước" onPress={() => onChange(shiftMonth(value, -1))} style={styles.stepButton}><Icon name="chevron-left" color={colors.money} size={24} /></Pressable>
      <Pressable accessibilityLabel="Về tháng này" onPress={() => onChange(currentMonth())} style={{ flex: 1, alignItems: 'center' }}>
        <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.ink }}>{monthLabel(value)}</Text>
        {!isCurrent && <Text style={{ fontSize: font.caption, color: colors.money }}>Chạm để về tháng này</Text>}
      </Pressable>
      <Pressable accessibilityLabel="Tháng sau" onPress={() => onChange(shiftMonth(value, 1))} style={styles.stepButton}><Icon name="chevron-right" color={colors.money} size={24} /></Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 4, minHeight: 52 },
  stepButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  summary: { borderRadius: 16, padding: 16, marginHorizontal: 16, marginTop: 12 },
  part: { paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  note: { fontSize: font.caption, color: colors.muted, marginHorizontal: 16, marginTop: 10, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, rowGap: 8 },
  cell: { width: '50%', paddingRight: 8 },
})
