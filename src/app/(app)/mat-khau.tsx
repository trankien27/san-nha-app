import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useAuth } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { changePassword } from '@/lib/endpoints'
import { Banner, Button } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

/** Người dùng đang đăng nhập tự đổi mật khẩu (màn mở từ menu, khác màn bắt buộc đổi mật khẩu tạm). */
export default function ChangeOwnPasswordScreen() {
  const { updateUser } = useAuth()
  const notify = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!current || !next) { setError('Nhập đủ mật khẩu hiện tại và mật khẩu mới.'); return }
    // Cùng chính sách mật khẩu với backend: tối thiểu 10 ký tự, đủ chữ hoa, chữ thường, số và ký tự đặc biệt.
    if (next.length < 10) { setError('Mật khẩu mới cần ít nhất 10 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.'); return }
    if (next !== confirm) { setError('Mật khẩu nhập lại không khớp.'); return }
    setBusy(true); setError(null)
    try {
      updateUser(await changePassword(current, next))
      notify('success', 'Đã đổi mật khẩu.')
      if (router.canGoBack()) router.back()
      else { setCurrent(''); setNext(''); setConfirm('') }
    } catch (changeError) {
      setError(errorMessage(changeError, 'Không đổi được mật khẩu.'))
    } finally {
      setBusy(false)
    }
  }

  const fields: [string, string, (value: string) => void][] = [
    ['Mật khẩu hiện tại', current, setCurrent],
    ['Mật khẩu mới', next, setNext],
    ['Nhập lại mật khẩu mới', confirm, setConfirm],
  ]

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen options={{ title: 'Đổi mật khẩu' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.sub}>Mật khẩu mới cần ít nhất 10 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt. Các phiên đăng nhập khác sẽ phải đăng nhập lại.</Text>
        {error && <Banner tone="danger" icon="alert-circle-outline" text={error} />}
        {fields.map(([label, value, setter]) => (
          <View key={label} style={{ gap: 6 }}>
            <Text style={styles.label}>{label}</Text>
            <TextInput style={styles.input} secureTextEntry autoCapitalize="none" autoCorrect={false} value={value} onChangeText={(text) => { setter(text); setError(null) }} />
          </View>
        ))}
        <Button label="Lưu mật khẩu" icon="lock-reset" onPress={() => void submit()} busy={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  sub: { fontSize: font.small, color: colors.muted },
  label: { fontSize: font.small, color: colors.muted, fontWeight: '500' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, fontSize: font.body, color: colors.ink },
})
