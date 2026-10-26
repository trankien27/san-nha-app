import { router, type Href } from 'expo-router'
import { useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getSessions } from '@/lib/endpoints'
import { bangkokDayStartUtc, formatVnd } from '@/lib/format'
import { useLoad } from '@/lib/useLoad'
import { EmptyState, ErrorState, Icon, Loading, type IconName } from '@/ui/components'
import { SessionCard } from '@/ui/SessionCard'
import { colors, font } from '@/ui/theme'

type Filter = 'unpaid' | 'unbilled'

// Lối tắt sang các màn tiền chung; ép kiểu Href vì typed routes (.expo/types) chỉ cập nhật khi chạy expo start.
const shortcuts: { label: string; icon: IconName; path: string }[] = [
  { label: 'Công nợ', icon: 'account-cash-outline', path: '/tien/cong-no' },
  { label: 'Đã thu', icon: 'cash-check', path: '/tien/da-thu' },
  { label: 'Thu chi', icon: 'swap-vertical', path: '/tien/thu-chi' },
  { label: 'Đối soát', icon: 'scale-balance', path: '/tien/doi-soat' },
]

/** Thu tiền theo buổi trong 60 ngày qua: buổi đã chốt còn thiếu tiền, và buổi đã đánh nhưng chưa tính tiền. */
export default function CollectScreen() {
  const insets = useSafeAreaInsets()
  const [filter, setFilter] = useState<Filter>('unpaid')
  const { data, error, loading, refreshing, reload } = useLoad(async () => {
    const sessions = (await getSessions({ from: bangkokDayStartUtc(-60), to: bangkokDayStartUtc(1), pageSize: 100 })).items.reverse()
    return {
      unpaid: sessions.filter((session) => session.status === 'costClosed' && session.amountDue !== null && session.collectedAmount < session.amountDue),
      unbilled: sessions.filter((session) => session.status === 'completed' || ((session.status === 'open' || session.status === 'full') && new Date(session.startsAtUtc) <= new Date())),
    }
  })
  const rows = data?.[filter] ?? []
  const missing = (data?.unpaid ?? []).reduce((sum, session) => sum + (session.amountDue ?? 0) - session.collectedAmount, 0)

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 8 }}>
      <Text style={styles.title}>Thu tiền</Text>
      <View style={styles.shortcuts}>
        {shortcuts.map((item) => (
          <Pressable key={item.path} accessibilityRole="button" onPress={() => router.push(item.path as Href)} style={({ pressed }) => [styles.shortcut, { opacity: pressed ? 0.8 : 1 }]}>
            <Icon name={item.icon} size={22} color={colors.money} />
            <Text style={{ fontSize: font.caption, fontWeight: '600', color: colors.ink }} numberOfLines={1}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      {data && (
        <View style={styles.summary}>
          <Text style={{ color: colors.moneyLight, fontSize: font.small }}>Còn thiếu ở {data.unpaid.length} buổi đã chốt</Text>
          <Text style={{ color: '#fff', fontSize: font.big, fontWeight: '700' }}>{formatVnd(missing)}</Text>
        </View>
      )}
      <View style={styles.segment}>
        {([['unpaid', `Còn thiếu tiền${data ? ` (${data.unpaid.length})` : ''}`], ['unbilled', `Chưa tính tiền${data ? ` (${data.unbilled.length})` : ''}`]] as const).map(([value, label]) => (
          <Pressable key={value} onPress={() => setFilter(value)} style={[styles.segmentItem, filter === value && styles.segmentActive]}>
            <Text style={{ fontSize: font.small, fontWeight: '600', color: filter === value ? '#fff' : colors.ink }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SessionCard session={item} showMoney />}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}
          ListEmptyComponent={<EmptyState icon="check-circle-outline" title={filter === 'unpaid' ? 'Các buổi đã thu đủ tiền' : 'Không còn buổi chờ tính tiền'} message="Trong 60 ngày gần đây." />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: font.title, fontWeight: '700', color: colors.ink, marginHorizontal: 16, marginBottom: 12 },
  shortcuts: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  shortcut: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 64, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.moneySoft },
  summary: { backgroundColor: colors.money, borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12 },
  segment: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  segmentItem: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
  segmentActive: { backgroundColor: colors.money, borderColor: colors.money },
})
