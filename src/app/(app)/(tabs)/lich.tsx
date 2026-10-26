import { router } from 'expo-router'
import { useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePermissions } from '@/auth/AuthContext'
import { getSessions } from '@/lib/endpoints'
import { bangkokDayStartUtc } from '@/lib/format'
import { useLoad } from '@/lib/useLoad'
import { Button, EmptyState, ErrorState, Loading } from '@/ui/components'
import { SessionCard } from '@/ui/SessionCard'
import { colors, font } from '@/ui/theme'

type Range = 'upcoming' | 'past'

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets()
  const { canBill, canManage } = usePermissions()
  const [range, setRange] = useState<Range>('upcoming')
  const { data, error, loading, refreshing, reload } = useLoad(async () => {
    const result = range === 'upcoming'
      ? await getSessions({ from: bangkokDayStartUtc(0), to: bangkokDayStartUtc(60), pageSize: 100 })
      : await getSessions({ from: bangkokDayStartUtc(-60), to: bangkokDayStartUtc(0), pageSize: 100 })
    return range === 'upcoming' ? result.items : [...result.items].reverse()
  }, range)

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12 }}>
        <Text style={[styles.title, { flex: 1, marginHorizontal: 0, marginBottom: 0 }]}>Lịch đánh</Text>
        {canManage && <Button label="Tạo lịch" icon="plus" onPress={() => router.push('/lich-danh/form')} style={{ minHeight: 38, paddingHorizontal: 12 }} />}
      </View>
      <View style={styles.segment}>
        {([['upcoming', 'Sắp tới'], ['past', 'Đã qua']] as const).map(([value, label]) => (
          <Pressable key={value} onPress={() => setRange(value)} style={[styles.segmentItem, range === value && styles.segmentActive]}>
            <Text style={{ fontSize: font.small, fontWeight: '600', color: range === value ? '#fff' : colors.ink }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SessionCard session={item} showMoney={canBill} />}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}
          ListEmptyComponent={<EmptyState icon="calendar-blank-outline" title={range === 'upcoming' ? 'Chưa có lịch sắp tới' : 'Chưa có lịch trong 60 ngày qua'} message="Lịch đánh được tạo trên trang quản lý web." />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: font.title, fontWeight: '700', color: colors.ink, marginHorizontal: 16, marginBottom: 12 },
  segment: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  segmentItem: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
  segmentActive: { backgroundColor: colors.brand, borderColor: colors.brand },
})
