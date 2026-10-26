import { router, type Href } from 'expo-router'
import { Alert, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { roleLabels, useAuth, usePermissions } from '@/auth/AuthContext'
import { API_BASE_URL, ApiError } from '@/lib/api'
import { getPersonalReport } from '@/lib/endpoints'
import { formatVnd, formatWeekdayDate } from '@/lib/format'
import { useLoad } from '@/lib/useLoad'
import { UpdateSection } from '@/ui/AppUpdate'
import { Avatar, Button, Card, Chip, EmptyState, Icon, Loading, SectionTitle, styles as ui, type IconName } from '@/ui/components'
import { colors, font } from '@/ui/theme'

const attendanceLabels = { pending: 'Chưa điểm danh', present: 'Có mặt', absentExcused: 'Vắng có phép', absentUnexcused: 'Vắng', guest: 'Khách' } as const

interface MenuItem { label: string; icon: IconName; href: Href; show: boolean }

export default function MeScreen() {
  const { user, logout } = useAuth()
  const { canManage, canBill } = usePermissions()
  const isAdmin = user?.roles.includes('ADMIN') ?? false
  const menu: { title: string; items: MenuItem[] }[] = [
    { title: 'Quản lý CLB', items: [
      { label: 'Tạo lịch đánh', icon: 'calendar-plus', href: '/lich-danh/form', show: canManage },
      { label: 'Người chơi', icon: 'account-multiple-outline', href: '/nguoi-choi', show: canManage },
      { label: 'Địa điểm và sân', icon: 'map-marker-radius-outline', href: '/dia-diem', show: canManage },
    ] },
    { title: 'Tiền và vật tư', items: [
      { label: 'Công nợ', icon: 'account-cash-outline', href: '/tien/cong-no', show: canBill },
      { label: 'Đã thu', icon: 'cash-check', href: '/tien/da-thu', show: canBill },
      { label: 'Thu chi', icon: 'swap-vertical', href: '/tien/thu-chi', show: canBill },
      { label: 'Đối soát', icon: 'scale-balance', href: '/tien/doi-soat', show: canBill },
      { label: 'Vật tư', icon: 'package-variant-closed', href: '/vat-tu', show: canBill },
    ] },
    { title: 'Thống kê', items: [
      { label: 'Thống kê trận', icon: 'chart-line', href: '/thong-ke', show: canManage },
      { label: 'Báo cáo', icon: 'file-chart-outline', href: '/bao-cao', show: canBill },
    ] },
    { title: 'Hệ thống', items: [
      { label: 'Tài khoản', icon: 'account-key-outline', href: '/tai-khoan', show: isAdmin },
      { label: 'Cài đặt CLB', icon: 'cog-outline', href: '/cai-dat', show: isAdmin },
      { label: 'Đổi mật khẩu', icon: 'lock-reset', href: '/mat-khau', show: true },
    ] },
  ]
  const insets = useSafeAreaInsets()
  // Tài khoản chưa liên kết hồ sơ người chơi trả 404: chỉ ẩn phần công nợ cá nhân.
  const { data, loading, refreshing, reload } = useLoad(async () => {
    try { return await getPersonalReport() } catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error }
  })

  const confirmLogout = () => {
    if (Platform.OS === 'web') { void logout(); return }
    Alert.alert('Đăng xuất', 'Bạn muốn đăng xuất khỏi app?', [{ text: 'Hủy', style: 'cancel' }, { text: 'Đăng xuất', style: 'destructive', onPress: () => void logout() }])
  }

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Avatar name={user?.displayName ?? '?'} size={72} />
        <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.ink }}>{user?.displayName}</Text>
        <Text style={{ fontSize: font.small, color: colors.muted }}>{user?.email}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          {user?.roles.map((role) => <Chip key={role} label={roleLabels[role]} bg={colors.brandSoft} fg={colors.brand} />)}
        </View>
      </View>

      {menu.map((group) => group.items.some((item) => item.show) && (
        <View key={group.title}>
          <SectionTitle>{group.title}</SectionTitle>
          <Card style={{ paddingVertical: 2 }}>
            {group.items.filter((item) => item.show).map((item, index, items) => (
              <Pressable key={item.label} onPress={() => router.push(item.href)} style={({ pressed }) => [ui.row, index === items.length - 1 && { borderBottomWidth: 0 }, { opacity: pressed ? 0.7 : 1 }]}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={item.icon} size={19} color={colors.brandMid} /></View>
                <Text style={[ui.rowTitle, { flex: 1 }]}>{item.label}</Text>
                <Icon name="chevron-right" color={colors.muted} />
              </Pressable>
            ))}
          </Card>
        </View>
      ))}

      {loading ? <Loading /> : data && (
        <>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 20 }}>
            <View style={{ flex: 1, backgroundColor: data.outstanding > 0 ? colors.liveSoft : colors.okSoft, borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: font.caption, color: data.outstanding > 0 ? colors.liveDark : colors.ok }}>Bạn còn nợ</Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: data.outstanding > 0 ? colors.liveDark : colors.ok }}>{formatVnd(data.outstanding)}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: font.caption, color: colors.muted }}>Số dư có</Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>{formatVnd(data.creditBalance)}</Text>
            </View>
          </View>
          <SectionTitle>Khoản còn nợ</SectionTitle>
          <Card style={{ paddingVertical: 2 }}>
            {data.receivables.filter((row) => row.outstandingAmount > 0).length === 0
              ? <EmptyState icon="check-circle-outline" title="Không còn khoản nợ" />
              : data.receivables.filter((row) => row.outstandingAmount > 0).map((row) => (
                <View key={row.id} style={ui.row}>
                  <Text style={[ui.rowTitle, { flex: 1 }]} numberOfLines={2}>{row.description}</Text>
                  <Text style={{ fontSize: font.body, fontWeight: '600', color: colors.liveDark }}>{formatVnd(row.outstandingAmount)}</Text>
                </View>
              ))}
          </Card>
          <SectionTitle>Buổi gần đây</SectionTitle>
          <Card style={{ paddingVertical: 2 }}>
            {data.recentAttendance.length === 0 ? <EmptyState icon="calendar-blank-outline" title="Chưa tham gia buổi nào" /> : data.recentAttendance.slice(0, 10).map((row) => (
              <View key={row.sessionId} style={ui.row}>
                <View style={{ flex: 1 }}>
                  <Text style={ui.rowTitle} numberOfLines={1}>{row.sessionTitle}</Text>
                  <Text style={ui.rowSub}>{formatWeekdayDate(row.startsAtUtc)}</Text>
                </View>
                <Chip label={attendanceLabels[row.status]} bg={row.status === 'present' || row.status === 'guest' ? colors.brandSoft : colors.neutralSoft} fg={row.status === 'present' || row.status === 'guest' ? colors.brand : colors.neutral} />
              </View>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Cập nhật app</SectionTitle>
      <Card><UpdateSection /></Card>

      <View style={{ paddingHorizontal: 16, marginTop: 24, gap: 10 }}>
        <Button label="Đăng xuất" tone="danger" icon="logout" onPress={confirmLogout} />
        <Text style={{ fontSize: font.caption, color: colors.muted, textAlign: 'center' }}>Máy chủ: {API_BASE_URL.replace(/^https?:\/\//, '')}</Text>
      </View>
    </ScrollView>
  )
}
