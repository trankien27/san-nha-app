import { Tabs } from 'expo-router'
import { usePermissions } from '@/auth/AuthContext'
import { Icon, type IconName } from '@/ui/components'
import { colors } from '@/ui/theme'

function tabIcon(name: IconName) {
  return function TabIcon({ color }: { color: unknown }) {
    return <Icon name={name} size={24} color={typeof color === 'string' ? color : colors.muted} />
  }
}

export default function TabsLayout() {
  const { canManage, canBill } = usePermissions()
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.brandMid, tabBarInactiveTintColor: colors.muted, tabBarLabelStyle: { fontSize: 12 }, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Hôm nay', tabBarIcon: tabIcon('home-variant-outline') }} />
      <Tabs.Screen name="lich" options={{ title: 'Lịch', tabBarIcon: tabIcon('calendar-month-outline') }} />
      <Tabs.Screen name="tai-san" options={{ title: 'Tại sân', tabBarIcon: tabIcon('badminton'), href: canManage || canBill ? undefined : null }} />
      <Tabs.Screen name="thu-tien" options={{ title: 'Thu tiền', tabBarIcon: tabIcon('wallet-outline'), href: canBill ? undefined : null }} />
      <Tabs.Screen name="toi" options={{ title: 'Thêm', tabBarIcon: tabIcon('dots-grid') }} />
    </Tabs>
  )
}
