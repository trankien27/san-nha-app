import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { Banner, Button, Icon } from '@/ui/components'
import { colors, font } from '@/ui/theme'

export default function LoginScreen() {
  const { login } = useAuth()
  const insets = useSafeAreaInsets()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!email.trim() || !password) { setError('Nhập email và mật khẩu.'); return }
    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
    } catch (loginError) {
      setError(errorMessage(loginError, 'Không đăng nhập được.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.brand }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 48 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: 24 }}>
          <View style={styles.logo}><Icon name="badminton" size={40} color={colors.brand} /></View>
          <Text style={styles.brand}>Sân Nhà</Text>
          <Text style={styles.tagline}>Quản lý câu lạc bộ cầu lông</Text>
        </View>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 32 }]}>
          <Text style={styles.title}>Đăng nhập</Text>
          {error && <Banner tone="danger" icon="alert-circle-outline" text={error} />}
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} value={email} onChangeText={(value) => { setEmail(value); setError(null) }} placeholder="ten@caulong.vn" placeholderTextColor={colors.muted} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Mật khẩu</Text>
            <View>
              <TextInput style={[styles.input, { paddingRight: 48 }]} value={password} onChangeText={(value) => { setPassword(value); setError(null) }} placeholder="Nhập mật khẩu" placeholderTextColor={colors.muted} secureTextEntry={!showPassword} autoComplete="password" textContentType="password" onSubmitEditing={() => void submit()} />
              <Pressable accessibilityLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onPress={() => setShowPassword((value) => !value)} style={styles.eye}>
                <Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} color={colors.muted} />
              </Pressable>
            </View>
          </View>
          <Button label="Đăng nhập" onPress={() => void submit()} busy={busy} style={{ marginHorizontal: 0 }} />
          <Text style={styles.hint}>Chưa có tài khoản? Liên hệ quản trị CLB để được cấp.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  logo: { width: 76, height: 76, borderRadius: 24, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 28, fontWeight: '700', color: '#fff' },
  tagline: { fontSize: font.body, color: colors.brandLight },
  sheet: { marginTop: 40, flexGrow: 1, backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 16 },
  title: { fontSize: font.title, fontWeight: '700', color: colors.ink },
  field: { gap: 6 },
  label: { fontSize: font.small, color: colors.muted, fontWeight: '500' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, fontSize: font.body, color: colors.ink },
  eye: { position: 'absolute', right: 6, top: 0, bottom: 0, width: 40, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: font.small, color: colors.muted, textAlign: 'center' },
})
