import { Stack } from 'expo-router'
import { UpdateChecker } from '@/ui/AppUpdate'
import { colors } from '@/ui/theme'

/** Các màn cần đăng nhập. Màn con tự đặt tiêu đề bằng <Stack.Screen options={{ title }} />. */
export default function AppLayout() {
  return (
    <>
    <UpdateChecker />
    <Stack screenOptions={{ headerShown: true, contentStyle: { backgroundColor: colors.bg }, headerTintColor: colors.brand, headerTitleStyle: { color: colors.ink }, headerBackTitle: 'Quay lại' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="buoi/[id]/index" options={{ title: 'Lịch đánh' }} />
      <Stack.Screen name="buoi/[id]/diem-danh" options={{ title: 'Điểm danh' }} />
      <Stack.Screen name="buoi/[id]/chia-tran" options={{ title: 'Chia trận' }} />
      <Stack.Screen name="buoi/[id]/tien" options={{ title: 'Tiền buổi' }} />
    </Stack>
    </>
  )
}
