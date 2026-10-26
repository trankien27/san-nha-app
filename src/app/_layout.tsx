import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from '@/auth/AuthContext'
import { Loading } from '@/ui/components'
import { colors } from '@/ui/theme'
import { ToastProvider } from '@/ui/toast'

function RootStack() {
  const { user, restoring } = useAuth()
  // Nạp sẵn font icon để icon không bị trống lúc mở app (nhất là trên web).
  const [iconsLoaded, iconsError] = useFonts(MaterialCommunityIcons.font)
  if (restoring || (!iconsLoaded && !iconsError)) return <Loading label="Đang mở app…" />
  const signedIn = Boolean(user)
  const ready = signedIn && !user?.mustChangePassword
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      {/* Mọi màn trong nhóm (app) chỉ mở được khi đã đăng nhập và không còn mật khẩu tạm. */}
      <Stack.Protected guard={ready}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !ready}>
        <Stack.Screen name="doi-mat-khau" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <RootStack />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
