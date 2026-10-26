import { Stack } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/auth/AuthContext'
import { ApiError, errorMessage } from '@/lib/api'
import { formatTime, formatWeekdayDate } from '@/lib/format'
import { getClubSettings, updateClubSettings, type UpdateClubSettingsInput } from '@/lib/services/reports'
import { useLoad } from '@/lib/useLoad'
import { Banner, Button, Card, Chip, EmptyState, ErrorState, Icon, Loading, SectionTitle, type IconName } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

type FieldErrors = Partial<Record<keyof UpdateClubSettingsInput, string>>
const emptyForm: UpdateClubSettingsInput = { name: '', address: '', phoneNumber: '', roundingRule: 'nearest1000' }
const backendFields: Record<string, keyof UpdateClubSettingsInput> = { Name: 'name', Address: 'address', PhoneNumber: 'phoneNumber', RoundingRule: 'roundingRule' }

// Cùng quy tắc với trang web và validator phía server.
function validate(form: UpdateClubSettingsInput): FieldErrors {
  const errors: FieldErrors = {}
  const name = form.name.trim()
  const address = form.address.trim()
  if (name.length < 2 || name.length > 120) errors.name = 'Tên phải từ 2 đến 120 ký tự.'
  if (address.length < 5 || address.length > 255) errors.address = 'Địa chỉ phải từ 5 đến 255 ký tự.'
  if (!/^[0-9+().\-\s]{8,20}$/.test(form.phoneNumber.trim())) errors.phoneNumber = 'Số điện thoại chưa đúng định dạng.'
  return errors
}

/** Thông tin CLB (chỉ Quản trị); tiền tệ VNĐ và múi giờ Asia/Bangkok là cố định. */
export default function SettingsScreen() {
  const isAdmin = useAuth().user?.roles.includes('ADMIN') ?? false
  return (
    <>
      <Stack.Screen options={{ title: 'Cài đặt CLB' }} />
      {isAdmin ? <Settings /> : <EmptyState icon="lock-outline" title="Bạn không có quyền sửa cài đặt" message="Chỉ Quản trị viên dùng được mục này." />}
    </>
  )
}

function Settings() {
  const insets = useSafeAreaInsets()
  const notify = useToast()
  const [form, setForm] = useState<UpdateClubSettingsInput>(emptyForm)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const { data: settings, setData, error, loading, refreshing, reload } = useLoad(async () => {
    const value = await getClubSettings()
    setForm({ name: value.name, address: value.address, phoneNumber: value.phoneNumber, roundingRule: value.roundingRule })
    setFieldErrors({}); setSubmitError(null)
    return value
  })

  if (loading) return <Loading label="Đang tải cấu hình…" />
  if (error || !settings) return <ErrorState message={error ?? 'Không tìm thấy dữ liệu cấu hình câu lạc bộ.'} onRetry={() => void reload()} />

  const hasChanges = form.name !== settings.name || form.address !== settings.address || form.phoneNumber !== settings.phoneNumber || form.roundingRule !== settings.roundingRule
  const update = <K extends keyof UpdateClubSettingsInput>(field: K, value: UpdateClubSettingsInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setSubmitError(null)
  }

  const save = async () => {
    const errors = validate(form)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    setSaving(true); setSubmitError(null)
    try {
      const saved = await updateClubSettings({ ...form, name: form.name.trim(), address: form.address.trim(), phoneNumber: form.phoneNumber.trim() })
      setData(saved)
      setForm({ name: saved.name, address: saved.address, phoneNumber: saved.phoneNumber, roundingRule: saved.roundingRule })
      notify('success', 'Đã lưu thông tin câu lạc bộ.')
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        const mapped: FieldErrors = {}
        Object.entries(saveError.fieldErrors).forEach(([field, messages]) => {
          const key = backendFields[field] ?? backendFields[field.charAt(0).toUpperCase() + field.slice(1)]
          if (key) mapped[key] = messages[0]
        })
        setFieldErrors(mapped)
      }
      setSubmitError(errorMessage(saveError, 'Không thể lưu cấu hình.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor={colors.brand} />}>
        <SectionTitle>Thông tin câu lạc bộ</SectionTitle>
        <Card style={{ gap: 14 }}>
          <Chip label="Đã lưu trong database" icon="check" bg={colors.okSoft} fg={colors.ok} />
          <Field icon="domain" label="Tên câu lạc bộ *" error={fieldErrors.name}>
            <TextInput value={form.name} onChangeText={(text) => update('name', text)} maxLength={120} style={[styles.input, fieldErrors.name && styles.invalid]} />
          </Field>
          <Field icon="phone-outline" label="Số điện thoại *" error={fieldErrors.phoneNumber}>
            <TextInput value={form.phoneNumber} onChangeText={(text) => update('phoneNumber', text)} maxLength={20} keyboardType="phone-pad" style={[styles.input, fieldErrors.phoneNumber && styles.invalid]} />
          </Field>
          <Field icon="map-marker-outline" label="Địa chỉ *" error={fieldErrors.address} hint={`${form.address.length}/255`}>
            <TextInput value={form.address} onChangeText={(text) => update('address', text)} maxLength={255} multiline numberOfLines={3} textAlignVertical="top" style={[styles.input, styles.multiline, fieldErrors.address && styles.invalid]} />
          </Field>
        </Card>

        <SectionTitle>Quy ước vận hành</SectionTitle>
        <Card style={{ gap: 12 }}>
          <Fixed icon="cash" label="Đơn vị tiền tệ" value="Việt Nam Đồng (VNĐ)" note="Lưu dưới dạng số nguyên" />
          <Fixed icon="clock-outline" label="Múi giờ" value="Asia/Bangkok" note="UTC+07:00" />
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {submitError ? <Banner tone="danger" icon="alert-circle-outline" text={submitError} />
          : <Text style={{ fontSize: font.small, color: colors.muted, marginHorizontal: 16 }}>{hasChanges ? 'Bạn có thay đổi chưa lưu.' : `Cập nhật gần nhất: ${formatWeekdayDate(settings.updatedAtUtc)} ${formatTime(settings.updatedAtUtc)}`}</Text>}
        <Button label={saving ? 'Đang lưu…' : 'Lưu thay đổi'} icon="content-save-outline" busy={saving} disabled={!hasChanges} onPress={() => void save()} style={{ marginHorizontal: 16 }} />
      </View>
    </KeyboardAvoidingView>
  )
}

function Field({ icon, label, error, hint, children }: { icon: IconName; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={16} color={colors.muted} />
        <Text style={{ flex: 1, fontSize: font.small, color: colors.muted, fontWeight: '500' }}>{label}</Text>
        {hint && <Text style={{ fontSize: font.caption, color: colors.muted }}>{hint}</Text>}
      </View>
      {children}
      {error && <Text style={{ fontSize: font.small, color: colors.danger }}>{error}</Text>}
    </View>
  )
}

function Fixed({ icon, label, value, note }: { icon: IconName; label: string; value: string; note: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={styles.fixedIcon}><Icon name={icon} size={20} color={colors.brandMid} /></View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.caption, color: colors.muted }}>{label}</Text>
        <Text style={{ fontSize: font.body, fontWeight: '600', color: colors.ink }}>{value}</Text>
        <Text style={{ fontSize: font.caption, color: colors.muted }}>{note}</Text>
      </View>
      <Chip label="Cố định" icon="lock-outline" bg={colors.neutralSoft} fg={colors.neutral} />
    </View>
  )
}

const styles = StyleSheet.create({
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, fontSize: font.body, color: colors.ink },
  multiline: { minHeight: 88, paddingTop: 12 },
  invalid: { borderColor: colors.danger },
  fixedIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  footer: { gap: 8, backgroundColor: '#fff', paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
})
