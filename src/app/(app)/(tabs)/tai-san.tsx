import { router } from 'expo-router'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePermissions } from '@/auth/AuthContext'
import { getSessions } from '@/lib/endpoints'
import { bangkokDayStartUtc, formatTime } from '@/lib/format'
import type { PlaySession } from '@/lib/types'
import { useLoad } from '@/lib/useLoad'
import { Card, Chip, EmptyState, ErrorState, Icon, Loading, SectionTitle, type IconName } from '@/ui/components'
import { courtNames, screenPath, statusMeta } from '@/ui/SessionCard'
import { colors, font } from '@/ui/theme'

/** Việc tại sân: các lịch đánh hôm nay (chưa hủy), mỗi lịch có lối tắt điểm danh, chia trận, tiền buổi. */
export default function CourtsideScreen() {
  const insets = useSafeAreaInsets()
  const { canManage, canBill } = usePermissions()
  const { data, error, loading, refreshing, reload } = useLoad(async () =>
    (await getSessions({ from: bangkokDayStartUtc(0), to: bangkokDayStartUtc(1) })).items.filter((session) => session.status !== 'cancelled' && session.status !== 'draft'))

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}>
      <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.ink, marginHorizontal: 16 }}>Tại sân hôm nay</Text>
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : (data ?? []).length === 0 ? (
        <EmptyState icon="badminton" title="Hôm nay không có lịch đánh" message="Xem các buổi khác ở tab Lịch." />
      ) : (data ?? []).map((session) => <CourtsideCard key={session.id} session={session} canManage={canManage} canBill={canBill} />)}
    </ScrollView>
  )
}

function CourtsideCard({ session, canManage, canBill }: { session: PlaySession; canManage: boolean; canBill: boolean }) {
  const meta = statusMeta[session.status]
  const go = (screen: 'diem-danh' | 'chia-tran' | 'tien') => router.push({ pathname: screenPath[screen], params: { id: session.id } })
  return (
    <>
      <SectionTitle>{formatTime(session.startsAtUtc)} – {formatTime(session.endsAtUtc)} · {session.title}</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: font.small, color: colors.muted, flex: 1 }} numberOfLines={1}>{session.venueName} · {courtNames(session)}</Text>
          <Chip label={meta.label} bg={meta.bg} fg={meta.fg} />
        </View>
        <Text style={{ fontSize: font.small, color: colors.ink, marginTop: 6 }}>{session.playerCount} người chơi · {session.registeredCount} đăng ký</Text>
        <View style={{ gap: 8, marginTop: 12 }}>
          <Action icon="clipboard-check-outline" label="Điểm danh" hint="Chọn người có mặt, thêm khách" bg={colors.brandSoft} fg={colors.brandMid} onPress={() => go('diem-danh')} />
          {canManage && <Action icon="sword-cross" label="Chia trận" hint="Xếp sân, bắt đầu và kết thúc trận" bg={colors.liveSoft} fg="#993C1D" onPress={() => go('chia-tran')} />}
          {canBill && <Action icon="calculator-variant-outline" label="Tiền buổi" hint="Ai đã trả, ai còn nợ" bg={colors.moneySoft} fg={colors.moneyMid} onPress={() => go('tien')} />}
        </View>
      </Card>
    </>
  )
}

function Action({ icon, label, hint, bg, fg, onPress }: { icon: IconName; label: string; hint: string; bg: string; fg: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, backgroundColor: colors.bg, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={22} color={fg} /></View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.body, fontWeight: '600', color: colors.ink }}>{label}</Text>
        <Text style={{ fontSize: font.caption, color: colors.muted }}>{hint}</Text>
      </View>
      <Icon name="chevron-right" color={colors.muted} />
    </Pressable>
  )
}
