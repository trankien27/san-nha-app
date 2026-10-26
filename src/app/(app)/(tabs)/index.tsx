import { router, type Href } from 'expo-router'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth, usePermissions } from '@/auth/AuthContext'
import { getDashboard, getDashboardActions } from '@/lib/endpoints'
import { formatTime, formatVndShort, formatWeekdayDate, isSameBangkokDay } from '@/lib/format'
import type { DashboardAction, PlaySession } from '@/lib/types'
import { useLoad } from '@/lib/useLoad'
import { Avatar, Card, Chip, EmptyState, ErrorState, Icon, Loading, SectionTitle, styles as ui, type IconName } from '@/ui/components'
import { courtNames, screenPath, type SessionScreen } from '@/ui/SessionCard'
import { colors, font } from '@/ui/theme'

/** Việc cần xử lý từ backend: bỏ phần QR SePay (đã ẩn trên giao diện) và đổi đường dẫn web sang tab của app. */
function mobileActions(actions: DashboardAction[]) {
  const routes: Record<string, Href> = { today: '/lich', billing: '/thu-tien' }
  const icons: Record<string, IconName> = { today: 'calendar-today', billing: 'receipt-text-outline', inventory: 'package-variant-closed' }
  return actions.filter((action) => action.id !== 'sepay').map((action) => ({
    ...action,
    description: action.id === 'billing' ? 'Nhập vật tư, số người và chốt tiền.' : action.description,
    href: routes[action.id],
    icon: icons[action.id] ?? 'bell-outline',
  }))
}

export default function TodayScreen() {
  const { user } = useAuth()
  const { canManage, canBill } = usePermissions()
  const insets = useSafeAreaInsets()
  const { data, error, loading, refreshing, reload } = useLoad(async () => {
    const [dashboard, actions] = await Promise.all([getDashboard(), getDashboardActions()])
    return { dashboard, actions: mobileActions(actions) }
  })

  const next = data?.dashboard.nextSessions[0]
  const openSession = (session: PlaySession, screen?: SessionScreen) =>
    router.push({ pathname: screen ? screenPath[screen] : '/buoi/[id]', params: { id: session.id } })

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor="#fff" />}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={user?.displayName ?? '?'} size={42} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.brandLight, fontSize: font.small }}>Xin chào</Text>
            <Text style={{ color: '#fff', fontSize: font.title, fontWeight: '700' }} numberOfLines={1}>{user?.displayName}</Text>
          </View>
          <Icon name="badminton" size={26} color={colors.brandLight} />
        </View>
      </View>

      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : data && (
        <>
          {next ? (
            <Pressable onPress={() => openSession(next)} style={[ui.card, styles.hero]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Chip label={isSameBangkokDay(next.startsAtUtc) ? 'Hôm nay' : 'Sắp tới'} icon="fire" bg={colors.liveSoft} fg={colors.liveDark} />
                <Text style={{ fontSize: font.caption, color: colors.muted }}>{formatWeekdayDate(next.startsAtUtc)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                <Text style={{ fontSize: font.big, fontWeight: '700', color: colors.ink }}>{formatTime(next.startsAtUtc)}</Text>
                <Text style={{ fontSize: font.small, color: colors.muted, flex: 1 }} numberOfLines={1}>– {formatTime(next.endsAtUtc)} · {courtNames(next)}</Text>
              </View>
              <Text style={{ fontSize: font.small, color: colors.muted }} numberOfLines={1}><Icon name="map-marker-outline" size={14} color={colors.muted} /> {next.venueName}</Text>
              <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: font.small, color: colors.ink }}>{next.registeredCount}/{next.maxParticipants} người đăng ký</Text>
                {next.waitlistedCount > 0 && <Text style={{ fontSize: font.small, color: colors.muted }}>{next.waitlistedCount} chờ</Text>}
              </View>
              <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, Math.round((next.registeredCount / Math.max(1, next.maxParticipants)) * 100))}%` }]} /></View>
            </Pressable>
          ) : (
            <Card style={styles.hero}><EmptyState icon="calendar-blank-outline" title="Chưa có lịch sắp tới" message="Lịch đánh mới sẽ hiện ở đây." /></Card>
          )}

          {next && (canManage || canBill) && (
            <View style={styles.tiles}>
              <Tile label="Điểm danh" icon="clipboard-check-outline" bg={colors.brandSoft} fg={colors.brandMid} onPress={() => openSession(next, 'diem-danh')} />
              {canManage && <Tile label="Chia trận" icon="sword-cross" bg={colors.liveSoft} fg="#993C1D" onPress={() => openSession(next, 'chia-tran')} />}
              {canBill && <Tile label="Tiền buổi" icon="calculator-variant-outline" bg={colors.moneySoft} fg={colors.moneyMid} onPress={() => openSession(next, 'tien')} />}
            </View>
          )}

          <View style={styles.stats}>
            {canBill ? (
              <>
                <Stat label="Còn phải thu" value={formatVndShort(data.dashboard.outstandingReceivables)} color="#993C1D" />
                <Stat label="Đã thu tháng" value={formatVndShort(data.dashboard.paymentsThisMonth)} color={colors.ok} />
                <Stat label="Vật tư sắp hết" value={String(data.dashboard.lowStockItems)} color={colors.warn} />
              </>
            ) : (
              <>
                <Stat label="Lịch sắp tới" value={String(data.dashboard.upcomingSessions)} />
                <Stat label={canManage ? 'Lượt đăng ký' : 'Bạn đã đăng ký'} value={String(data.dashboard.upcomingRegistrations)} />
                <Stat label="Người chơi" value={String(data.dashboard.activePlayers)} />
              </>
            )}
          </View>

          {data.actions.length > 0 && (
            <>
              <SectionTitle>Việc cần xử lý</SectionTitle>
              <Card style={{ paddingVertical: 2 }}>
                {data.actions.map((action, index) => (
                  <Pressable key={action.id} disabled={!action.href} onPress={() => action.href && router.push(action.href)} style={[ui.row, index === data.actions.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={styles.actionIcon}><Icon name={action.icon} size={20} color={colors.moneyMid} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={ui.rowTitle}>{action.title}</Text>
                      <Text style={ui.rowSub}>{action.description}</Text>
                    </View>
                    <Chip label={String(action.count)} bg={colors.moneySoft} fg={colors.money} />
                  </Pressable>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </ScrollView>
  )
}

function Tile({ label, icon, bg, fg, onPress }: { label: string; icon: IconName; bg: string; fg: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 6, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ backgroundColor: bg, borderRadius: 16, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center' }}><Icon name={icon} size={26} color={fg} /></View>
      <Text style={{ fontSize: font.caption, color: colors.ink }}>{label}</Text>
    </Pressable>
  )
}

function Stat({ label, value, color = colors.ink }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={{ fontSize: font.caption, color: colors.muted }}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color, marginTop: 2 }}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.brand, paddingHorizontal: 16, paddingBottom: 56 },
  hero: { marginTop: -40, borderWidth: 1, borderColor: colors.line },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.bg, marginTop: 6 },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.brandMid },
  tiles: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 16 },
  stats: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 16 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 12 },
  actionIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.moneySoft, alignItems: 'center', justifyContent: 'center' },
})
