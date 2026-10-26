import { useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { changePassword } from '@/lib/endpoints'
import { Banner, Button } from '@/ui/components'
import { colors, font } from '@/ui/theme'

/** Tài khoản mới hoặc vừa được cấp lại mật khẩu bắt buộc đổi mật khẩu trước khi dùng app. */
export default function ChangePasswordScreen() {
  const { updateUser, logout } = useAuth()
  const insets = useSafeAreaInsets()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!current || !next) { setError('Nhập đủ mật khẩu hiện tại và mật khẩu mới.'); return }
    if (next.length < 10) { setError('Mật khẩu mới cần ít nhất 10 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.'); return }
    if (next !== confirm) { setError('Mật khẩu nhập lại không khớp.'); return }
    setBusy(true); setError(null)
    try { updateUser(await changePassword(current, next)) } catch (changeError) { setError(errorMessage(changeError)) } finally { setBusy(false) }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 32, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Đổi mật khẩu</Text>
      <Text style={styles.sub}>Tài khoản của bạn đang dùng mật khẩu tạm. Đặt mật khẩu mới để tiếp tục.</Text>
      {error && <Banner tone="danger" icon="alert-circle-outline" text={error} />}
      {[['Mật khẩu hiện tại', current, setCurrent], ['Mật khẩu mới', next, setNext], ['Nhập lại mật khẩu mới', confirm, setConfirm]].map(([label, value, setter]) => (
        <View key={label as string} style={{ gap: 6 }}>
          <Text style={styles.label}>{label as string}</Text>
          <TextInput style={styles.input} secureTextEntry value={value as string} onChangeText={(text) => { (setter as (v: string) => void)(text); setError(null) }} />
        </View>
      ))}
      <Button label="Lưu mật khẩu" onPress={() => void submit()} busy={busy} />
      <Button label="Đăng xuất" tone="outline" onPress={() => void logout()} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: font.title, fontWeight: '700', color: colors.ink },
  sub: { fontSize: font.body, color: colors.muted },
  label: { fontSize: font.small, color: colors.muted, fontWeight: '500' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, fontSize: font.body, color: colors.ink },
})
