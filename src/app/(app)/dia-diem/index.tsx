import { Stack } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePermissions } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { formatVnd } from '@/lib/format'
import {
  archiveCourt, archiveVenue, createCourt, createVenue, fieldErrorsFrom, getAllCourts, getVenues, isGoogleMapsUrl, updateCourt, updateVenue,
  type Court, type UpsertCourtInput, type UpsertVenueInput, type Venue,
} from '@/lib/services/admin'
import { useLoad } from '@/lib/useLoad'
import { Banner, Button, Card, Chip, EmptyState, ErrorState, Icon, Loading, type IconName } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

type Editing = { kind: 'venue'; venue: Venue | null } | { kind: 'court'; court: Court | null; venueId: string } | null
type StatusFilter = 'all' | 'active' | 'inactive'

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n${message}`)) onConfirm(); return }
  Alert.alert(title, message, [{ text: 'Không', style: 'cancel' }, { text: 'Đồng ý', style: 'destructive', onPress: onConfirm }])
}

const mapsUrl = (venue: Venue) => venue.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([venue.name, venue.address].filter(Boolean).join(', '))}`
const venueToInput = (venue: Venue, isActive = venue.isActive): UpsertVenueInput => ({ name: venue.name, address: venue.address, mapUrl: venue.mapUrl ?? '', phoneNumber: venue.phoneNumber ?? '', notes: venue.notes ?? '', isActive })
const courtToInput = (court: Court, isActive = court.isActive): UpsertCourtInput => ({ code: court.code, name: court.name, venueId: court.venueId, defaultHourlyRate: court.defaultHourlyRate, notes: court.notes ?? '', isActive })

/** Địa điểm & sân (Quản trị, Hỗ trợ). Không xóa vật lý: "ngừng sử dụng" giữ toàn bộ lịch sử. Giá thuê chỉ Quản trị/Kế toán thấy. */
export default function VenuesScreen() {
  const { canManage, canBill } = usePermissions()
  const notify = useToast()
  const [editing, setEditing] = useState<Editing>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const { data, error, loading, refreshing, reload } = useLoad(async () => {
    if (!canManage) return null
    const [venues, courts] = await Promise.all([getVenues(), getAllCourts()])
    return { venues, courts }
  })

  if (!canManage) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: 'Địa điểm & sân' }} />
        <EmptyState icon="lock-outline" title="Không có quyền quản lý sân" message="Chỉ Quản trị và Hỗ trợ được quản lý địa điểm và sân." />
      </View>
    )
  }
  if (loading) return <><Stack.Screen options={{ title: 'Địa điểm & sân' }} /><Loading /></>
  if (error || !data) return <><Stack.Screen options={{ title: 'Địa điểm & sân' }} /><ErrorState message={error ?? 'Không tải được địa điểm.'} onRetry={() => void reload()} /></>

  const run = async (key: string, action: () => Promise<void>, success: string) => {
    setBusy(key)
    try { await action(); notify('success', success); await reload() } catch (actionError) { notify('error', errorMessage(actionError)) } finally { setBusy(null) }
  }
  const toggleVenue = (venue: Venue) => venue.isActive
    ? confirmAction('Ngừng sử dụng địa điểm', `Ngừng "${venue.name}" và toàn bộ sân của địa điểm? Dữ liệu và lịch sử vẫn được giữ.`, () => void run(venue.id, () => archiveVenue(venue.id), 'Đã ngừng sử dụng địa điểm.'))
    : void run(venue.id, async () => { await updateVenue(venue.id, venueToInput(venue, true)) }, 'Đã kích hoạt địa điểm. Bật lại từng sân nếu cần.')
  const toggleCourt = (court: Court) => court.isActive
    ? confirmAction('Ngừng sử dụng sân', `Ngừng sân "${court.code}"? Sân ngừng hoạt động không xuất hiện khi tạo lịch mới; lịch sử vẫn được giữ.`, () => void run(court.id, () => archiveCourt(court.id), 'Đã ngừng sử dụng sân.'))
    : void run(court.id, async () => { await updateCourt(court.id, courtToInput(court, true)) }, 'Đã kích hoạt sân.')

  const venues = data.venues.filter((venue) => filter === 'all' || venue.isActive === (filter === 'active'))
  const schedulable = data.venues.filter((venue) => venue.isActive).reduce((sum, venue) => sum + venue.activeCourtCount, 0)
  const saved = (message: string) => { setEditing(null); notify('success', message); void reload() }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Địa điểm & sân' }} />
      <ScrollView contentContainerStyle={{ paddingVertical: 12, paddingBottom: 32, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16 }}>
          <Text style={{ flex: 1, fontSize: font.small, color: colors.muted }}>{data.venues.length} địa điểm · {data.courts.length} sân · {schedulable} sân xếp lịch được</Text>
          <Button label="Địa điểm" icon="plus" onPress={() => setEditing({ kind: 'venue', venue: null })} style={{ paddingHorizontal: 12 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16 }}>
          {([['all', 'Tất cả'], ['active', 'Đang hoạt động'], ['inactive', 'Ngừng hoạt động']] as const).map(([value, label]) => (
            <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.choice, filter === value && styles.choiceOn]}>
              <Text style={{ fontSize: font.small, color: filter === value ? '#fff' : colors.ink }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {venues.length === 0 && <EmptyState icon="map-marker-outline" title={data.venues.length === 0 ? 'Chưa có địa điểm' : 'Không có địa điểm phù hợp'} message={data.venues.length === 0 ? 'Thêm địa điểm đầu tiên rồi thêm sân để tạo lịch đánh.' : undefined} />}

        {venues.map((venue) => {
          const courts = data.courts.filter((court) => court.venueId === venue.id).sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.code.localeCompare(b.code))
          return (
            <Card key={venue.id} style={{ gap: 10, opacity: venue.isActive ? 1 : 0.85 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.venueIcon, !venue.isActive && { backgroundColor: colors.neutralSoft }]}><Icon name="map-marker" color={venue.isActive ? colors.brand : colors.neutral} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.ink }}>{venue.name}</Text>
                  <Text style={{ fontSize: font.caption, color: colors.muted }}>{venue.address}</Text>
                  {venue.phoneNumber ? <Text style={{ fontSize: font.caption, color: colors.muted }}>ĐT: {venue.phoneNumber}</Text> : null}
                  {venue.notes ? <Text style={{ fontSize: font.caption, color: colors.muted }} numberOfLines={2}>{venue.notes}</Text> : null}
                </View>
                <Chip label={venue.isActive ? 'Hoạt động' : 'Ngừng'} bg={venue.isActive ? colors.okSoft : colors.neutralSoft} fg={venue.isActive ? colors.ok : colors.neutral} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <IconAction icon="map-search-outline" label="Bản đồ" onPress={() => void Linking.openURL(mapsUrl(venue)).catch(() => notify('error', 'Không mở được Google Maps.'))} />
                <IconAction icon="pencil-outline" label="Sửa" onPress={() => setEditing({ kind: 'venue', venue })} />
                <IconAction icon={venue.isActive ? 'archive-outline' : 'restore'} label={venue.isActive ? 'Ngừng' : 'Kích hoạt'} danger={venue.isActive} busy={busy === venue.id} disabled={busy !== null} onPress={() => toggleVenue(venue)} />
              </View>

              <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 6 }}>
                <Text style={{ fontSize: font.small, fontWeight: '600', color: colors.ink, marginBottom: 2 }}>Sân ({venue.activeCourtCount}/{venue.courtCount} hoạt động)</Text>
                {courts.length === 0 && <Text style={{ fontSize: font.caption, color: colors.muted, paddingVertical: 8 }}>Chưa có sân.</Text>}
                {courts.map((court) => (
                  <View key={court.id} style={styles.courtRow}>
                    <Pressable onPress={() => setEditing({ kind: 'court', court, venueId: venue.id })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
                      <View style={styles.courtCode}><Text style={{ fontSize: font.caption, fontWeight: '700', color: colors.brand }}>{court.code}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: font.body, color: court.isActive ? colors.ink : colors.muted }} numberOfLines={1}>{court.name}</Text>
                        <Text style={{ fontSize: font.caption, color: colors.muted }} numberOfLines={1}>
                          {court.isActive ? (venue.isActive ? 'Hoạt động' : 'Tạm ẩn (địa điểm ngừng)') : 'Ngừng hoạt động'}{canBill ? ` · ${formatVnd(court.defaultHourlyRate)}/giờ` : ''}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable accessibilityLabel={court.isActive ? `Ngừng sân ${court.code}` : `Kích hoạt sân ${court.code}`} disabled={busy !== null} onPress={() => toggleCourt(court)} style={[styles.smallAction, busy !== null && busy !== court.id && { opacity: 0.4 }]}>
                      <Icon name={court.isActive ? 'archive-outline' : 'restore'} size={18} color={court.isActive ? colors.danger : colors.brand} />
                    </Pressable>
                  </View>
                ))}
                <Button label="Thêm sân" tone="outline" icon="plus" onPress={() => setEditing({ kind: 'court', court: null, venueId: venue.id })} style={{ marginTop: 8 }} />
              </View>
            </Card>
          )
        })}
      </ScrollView>

      <Modal visible={editing !== null} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        {editing?.kind === 'venue' && <VenueSheet venue={editing.venue} onClose={() => setEditing(null)} onSaved={saved} />}
        {editing?.kind === 'court' && <CourtSheet court={editing.court} venues={data.venues} venueId={editing.venueId} canBill={canBill} onClose={() => setEditing(null)} onSaved={saved} />}
      </Modal>
    </View>
  )
}

function IconAction({ icon, label, danger, busy, disabled, onPress }: { icon: IconName; label: string; danger?: boolean; busy?: boolean; disabled?: boolean; onPress: () => void }) {
  return <Button label={label} icon={icon} tone={danger ? 'danger' : 'outline'} busy={busy} disabled={disabled} onPress={onPress} style={{ flex: 1, paddingHorizontal: 8 }} />
}

function VenueSheet({ venue, onClose, onSaved }: { venue: Venue | null; onClose: () => void; onSaved: (message: string) => void }) {
  type Key = 'name' | 'address' | 'phoneNumber' | 'mapUrl' | 'notes'
  const [form, setForm] = useState<UpsertVenueInput>(() => venue ? venueToInput(venue) : { name: '', address: '', mapUrl: '', phoneNumber: '', notes: '', isActive: true })
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof UpsertVenueInput>(field: K, value: UpsertVenueInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => { const next = { ...current }; delete next[field as Key]; return next })
  }
  const save = async () => {
    const next: Partial<Record<Key, string>> = {}
    const name = form.name.trim(); const address = form.address.trim(); const phone = form.phoneNumber.trim(); const mapUrl = form.mapUrl.trim()
    if (name.length < 2 || name.length > 120) next.name = 'Tên phải từ 2 đến 120 ký tự.'
    if (address.length < 5 || address.length > 255) next.address = 'Địa chỉ phải từ 5 đến 255 ký tự.'
    if (!/^[0-9+().\-\s]{8,20}$/.test(phone)) next.phoneNumber = 'Số điện thoại chưa đúng định dạng.'
    if (mapUrl && !isGoogleMapsUrl(mapUrl)) next.mapUrl = 'Link bản đồ phải là link Google Maps hợp lệ.'
    if (form.notes.length > 1000) next.notes = 'Ghi chú không được vượt quá 1.000 ký tự.'
    setErrors(next)
    if (Object.keys(next).length > 0) { setSubmitError('Kiểm tra lại các ô báo lỗi.'); return }
    setSaving(true)
    setSubmitError(null)
    try {
      const input = { ...form, name, address, phoneNumber: phone, mapUrl, notes: form.notes.trim() }
      if (venue) await updateVenue(venue.id, input)
      else await createVenue(input)
      onSaved(venue ? 'Đã cập nhật địa điểm.' : 'Đã tạo địa điểm mới.')
    } catch (saveError) {
      setErrors(fieldErrorsFrom<Key>(saveError, { Name: 'name', Address: 'address', MapUrl: 'mapUrl', PhoneNumber: 'phoneNumber', Notes: 'notes' }))
      setSubmitError(errorMessage(saveError, 'Không thể lưu địa điểm.'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Sheet title={venue ? 'Sửa địa điểm' : 'Thêm địa điểm'} onClose={onClose} footer={<Button label={venue ? 'Lưu thay đổi' : 'Thêm địa điểm'} icon="check" busy={saving} onPress={() => void save()} />}>
      {submitError && <Banner tone="danger" icon="alert-circle-outline" text={submitError} />}
      <Field label="Tên địa điểm" required error={errors.name}><Input value={form.name} maxLength={120} onChangeText={(value) => set('name', value)} invalid={Boolean(errors.name)} /></Field>
      <Field label="Số điện thoại" required error={errors.phoneNumber}><Input value={form.phoneNumber} maxLength={20} keyboardType="phone-pad" onChangeText={(value) => set('phoneNumber', value)} invalid={Boolean(errors.phoneNumber)} /></Field>
      <Field label="Địa chỉ" required error={errors.address} hint="Số nhà, đường, phường/xã, tỉnh/thành phố"><Input value={form.address} maxLength={255} multiline onChangeText={(value) => set('address', value)} invalid={Boolean(errors.address)} style={{ minHeight: 64, textAlignVertical: 'top', paddingTop: 10 }} /></Field>
      <Field label="Link Google Maps" error={errors.mapUrl} hint="Dán link Google Maps hoặc maps.app.goo.gl"><Input value={form.mapUrl} maxLength={1000} autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={(value) => set('mapUrl', value)} invalid={Boolean(errors.mapUrl)} /></Field>
      <Field label="Ghi chú" error={errors.notes} hint={`${form.notes.length}/1000`}><Input value={form.notes} maxLength={1000} multiline onChangeText={(value) => set('notes', value)} invalid={Boolean(errors.notes)} style={{ minHeight: 64, textAlignVertical: 'top', paddingTop: 10 }} /></Field>
      <ActiveSwitch value={form.isActive} onChange={(value) => set('isActive', value)} hint="Tắt để ngừng sử dụng nhưng vẫn giữ toàn bộ dữ liệu." />
    </Sheet>
  )
}

function CourtSheet({ court, venues, venueId, canBill, onClose, onSaved }: { court: Court | null; venues: Venue[]; venueId: string; canBill: boolean; onClose: () => void; onSaved: (message: string) => void }) {
  type Key = 'code' | 'name' | 'venueId' | 'defaultHourlyRate' | 'notes'
  const [form, setForm] = useState<UpsertCourtInput>(() => court ? courtToInput(court) : { code: '', name: '', venueId, defaultHourlyRate: 0, isActive: true, notes: '' })
  const [rate, setRate] = useState(() => (court && canBill ? String(court.defaultHourlyRate) : ''))
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof UpsertCourtInput>(field: K, value: UpsertCourtInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => { const next = { ...current }; delete next[field as Key]; return next })
  }
  const save = async () => {
    const next: Partial<Record<Key, string>> = {}
    const code = form.code.trim().toUpperCase(); const name = form.name.trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/.test(code)) next.code = 'Mã sân chỉ gồm chữ cái không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.'
    if (name.length < 2 || name.length > 120) next.name = 'Tên phải từ 2 đến 120 ký tự.'
    if (!form.venueId) next.venueId = 'Hãy chọn địa điểm.'
    if (canBill && !/^\d+$/.test(rate.trim())) next.defaultHourlyRate = 'Giá thuê phải là số nguyên VNĐ không âm.'
    if (form.notes.length > 1000) next.notes = 'Ghi chú không được vượt quá 1.000 ký tự.'
    setErrors(next)
    if (Object.keys(next).length > 0) { setSubmitError('Kiểm tra lại các ô báo lỗi.'); return }
    setSaving(true)
    setSubmitError(null)
    try {
      // Hỗ trợ không thấy giá: gửi giá đang có (server cũng tự giữ nguyên giá cũ).
      const input: UpsertCourtInput = { ...form, code, name, notes: form.notes.trim(), defaultHourlyRate: canBill ? Number(rate) : form.defaultHourlyRate }
      if (court) await updateCourt(court.id, input)
      else await createCourt(input)
      onSaved(court ? 'Đã cập nhật sân.' : 'Đã tạo sân mới.')
    } catch (saveError) {
      setErrors(fieldErrorsFrom<Key>(saveError, { Code: 'code', Name: 'name', VenueId: 'venueId', DefaultHourlyRate: 'defaultHourlyRate', Notes: 'notes' }))
      setSubmitError(errorMessage(saveError, 'Không thể lưu sân.'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Sheet title={court ? `Sửa sân ${court.code}` : 'Thêm sân'} onClose={onClose} footer={<Button label={court ? 'Lưu thay đổi' : 'Thêm sân'} icon="check" busy={saving} onPress={() => void save()} />}>
      {submitError && <Banner tone="danger" icon="alert-circle-outline" text={submitError} />}
      <Field label="Mã sân" required error={errors.code} hint="Duy nhất trong toàn hệ thống, VD: TT-01"><Input value={form.code} maxLength={30} autoCapitalize="characters" autoCorrect={false} onChangeText={(value) => set('code', value.toUpperCase())} invalid={Boolean(errors.code)} /></Field>
      <Field label="Tên sân" required error={errors.name}><Input value={form.name} maxLength={120} onChangeText={(value) => set('name', value)} invalid={Boolean(errors.name)} /></Field>
      <Field label="Địa điểm" required error={errors.venueId}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {venues.map((venue) => (
            <Pressable key={venue.id} accessibilityRole="button" accessibilityState={{ selected: form.venueId === venue.id }} onPress={() => set('venueId', venue.id)} style={[styles.choice, form.venueId === venue.id && styles.choiceOn]}>
              <Text style={{ fontSize: font.small, color: form.venueId === venue.id ? '#fff' : colors.ink }}>{venue.name}{venue.isActive ? '' : ' (ngừng)'}</Text>
            </Pressable>
          ))}
        </View>
      </Field>
      {canBill && (
        <Field label="Giá thuê mặc định/giờ (VNĐ)" required error={errors.defaultHourlyRate} hint={/^\d+$/.test(rate) ? `${formatVnd(Number(rate))} / giờ · đổi giá có ghi nhật ký` : undefined}>
          <Input value={rate} placeholder="VD: 120000" keyboardType="number-pad" maxLength={12} onChangeText={(value) => { setRate(value.replace(/\D/g, '')); setErrors((current) => ({ ...current, defaultHourlyRate: undefined })) }} invalid={Boolean(errors.defaultHourlyRate)} />
        </Field>
      )}
      <Field label="Ghi chú" error={errors.notes} hint={`${form.notes.length}/1000`}><Input value={form.notes} maxLength={1000} multiline onChangeText={(value) => set('notes', value)} invalid={Boolean(errors.notes)} style={{ minHeight: 64, textAlignVertical: 'top', paddingTop: 10 }} /></Field>
      <ActiveSwitch value={form.isActive} onChange={(value) => set('isActive', value)} hint="Sân ngừng hoạt động sẽ không xuất hiện khi tạo lịch mới." />
    </Sheet>
  )
}

function Sheet({ title, onClose, footer, children }: { title: string; onClose: () => void; footer: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetBackdrop}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ flex: 1, fontSize: font.body, fontWeight: '700', color: colors.ink }}>{title}</Text>
          <Pressable accessibilityLabel="Đóng" onPress={onClose} hitSlop={12}><Icon name="close" /></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>{children}</ScrollView>
        {footer}
      </View>
    </KeyboardAvoidingView>
  )
}

function ActiveSwitch({ value, onChange, hint }: { value: boolean; onChange: (value: boolean) => void; hint: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>Đang hoạt động</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.brandMid, false: colors.line }} thumbColor="#fff" />
    </View>
  )
}

function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}{required ? <Text style={{ color: colors.danger }}> *</Text> : null}</Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  )
}

function Input({ invalid, style, ...props }: TextInputProps & { invalid?: boolean }) {
  return <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, invalid && { borderColor: colors.danger }, style]} />
}

const styles = StyleSheet.create({
  label: { fontSize: font.small, fontWeight: '600', color: colors.ink },
  error: { fontSize: font.caption, color: colors.danger },
  hint: { fontSize: font.caption, color: colors.muted },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, fontSize: font.body, color: colors.ink, backgroundColor: '#fff' },
  choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
  choiceOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  venueIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  courtRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  courtCode: { minWidth: 48, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.brandSoft, alignItems: 'center' },
  smallAction: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: '92%' },
})
