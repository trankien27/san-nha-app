import { Stack } from 'expo-router'
import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { usePermissions } from '@/auth/AuthContext'
import { formatVnd } from '@/lib/format'
import { currentMonth, getCashFlow, monthLabel, monthRange, shiftMonth } from '@/lib/services/finance'
import { useLoad } from '@/lib/useLoad'
import { Card, EmptyState, ErrorState, Icon, Loading, SectionTitle, styles as ui } from '@/ui/components'
import { colors, font } from '@/ui/theme'

/** Thu chi theo tháng: thu từ người chơi; chi tiền sân và nhập vật tư; đối soát vật tư đã dùng theo giá vốn và giá xuất. */
export default function CashFlowScreen() {
  const { canBill } = usePermissions()
  const [month, setMonth] = useState(currentMonth)
  const { data, error, loading, refreshing, reload } = useLoad(() => {
    if (!canBill) return Promise.resolve(null)
    const { from, to } = monthRange(month)
    return getCashFlow(from, to)
  }, month)

  const header = <Stack.Screen options={{ title: 'Thu chi' }} />
  if (!canBill) return <>{header}<EmptyState icon="lock-outline" title="Không có quyền xem thu chi" message="Chỉ Quản trị và Kế toán mới xem được phần tiền." /></>
  const materialProfit = data ? data.materialRevenue - data.materialCost : 0

  return (
    <>
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}>
        <MonthStepper value={month} onChange={setMonth} />
        {loading ? <Loading label="Đang tính thu chi…" /> : error || !data ? <ErrorState message={error ?? 'Không thể tải thu chi.'} onRetry={() => void reload()} /> : (
          <>
            <View style={[styles.summary, { backgroundColor: data.net >= 0 ? colors.money : colors.danger }]}>
              <Text style={{ color: '#fff', opacity: 0.8, fontSize: font.small }}>Chênh lệch thu − chi</Text>
              <Text style={{ color: '#fff', fontSize: font.big, fontWeight: '700' }}>{formatVnd(data.net)}</Text>
            </View>
            <SectionTitle>Dòng tiền</SectionTitle>
            <Card style={{ paddingVertical: 2 }}>
              <Line label="Thu từ người chơi" value={data.collected} tone="income" />
              <Line label="Chi tiền sân" value={-data.courtFees} tone="expense" />
              <Line label="Chi nhập vật tư" value={-data.materialPurchases} tone="expense" />
              <Line label="Chênh lệch thu − chi" value={data.net} tone={data.net >= 0 ? 'income' : 'expense'} bold last />
            </Card>
            <SectionTitle>Đối soát vật tư đã dùng</SectionTitle>
            <Card style={{ paddingVertical: 2 }}>
              <Line label="Vốn bỏ ra (giá nhập)" value={data.materialCost} />
              <Line label="Thu vào (giá xuất)" value={data.materialRevenue} />
              <Line label="Chênh lệch vật tư" value={materialProfit} tone={materialProfit >= 0 ? 'income' : 'expense'} bold last />
            </Card>
            <Text style={styles.note}>
              Còn nợ hiện tại (mọi tháng): <Text style={{ fontWeight: '700', color: colors.ink }}>{formatVnd(data.outstanding)}</Text>. Tiền sân tính theo lịch đánh đã chốt trong tháng; nhập vật tư theo ngày nhập hàng.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  )
}

function Line({ label, value, tone, bold, last }: { label: string; value: number; tone?: 'income' | 'expense'; bold?: boolean; last?: boolean }) {
  const color = tone === 'income' ? colors.ok : tone === 'expense' ? colors.danger : colors.ink
  return (
    <View style={[ui.row, last && { borderBottomWidth: 0 }]}>
      <Text style={[ui.rowTitle, { flex: 1 }, bold && { fontWeight: '600' }]}>{label}</Text>
      <Text style={{ fontSize: font.body, color, fontWeight: bold ? '700' : '500' }}>{value < 0 ? `−${formatVnd(-value)}` : formatVnd(value)}</Text>
    </View>
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
  note: { fontSize: font.caption, color: colors.muted, marginHorizontal: 16, marginTop: 12, lineHeight: 18 },
})
