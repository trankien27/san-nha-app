import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePermissions } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { bangkokToday, formatVnd } from '@/lib/format'
import {
  createPlayer, defaultSkillRating, fieldErrorsFrom, genderLabels, getPlayer, legacySkillLevel, membershipLabels, parseDateInput,
  playerStatusLabels, skillLevelLabels, toDateInput, updatePlayer,
  type PlayerDetail, type PlayerGender, type PlayerMembershipType, type PlayerStatus, type UpsertPlayerInput,
} from '@/lib/services/admin'
import { useLoad } from '@/lib/useLoad'
import { Avatar, Banner, Button, Card, EmptyState, ErrorState, Icon, Loading, SectionTitle } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

interface FormModel {
  memberCode: string
  fullName: string
  phoneNumber: string
  email: string
  birthDate: string
  gender: PlayerGender | null
  skillRating: number
  membershipType: PlayerMembershipType
  joinedOn: string
  status: PlayerStatus
  notes: string
}
type FieldKey = 'memberCode' | 'fullName' | 'phoneNumber' | 'email' | 'birthDate' | 'skillRating' | 'joinedOn' | 'notes'
type Errors = Partial<Record<FieldKey, string>>

const serverFields: Record<string, FieldKey> = { MemberCode: 'memberCode', FullName: 'fullName', PhoneNumber: 'phoneNumber', Email: 'email', BirthDate: 'birthDate', SkillRating: 'skillRating', JoinedOn: 'joinedOn', Notes: 'notes' }

function initialForm(player: PlayerDetail | null): FormModel {
  if (!player) {
    return { memberCode: '', fullName: '', phoneNumber: '', email: '', birthDate: '', gender: null, skillRating: defaultSkillRating, membershipType: 'member', joinedOn: toDateInput(bangkokToday()), status: 'active', notes: '' }
  }
  return {
    memberCode: player.memberCode, fullName: player.fullName, phoneNumber: player.phoneNumber ?? '', email: player.email ?? '',
    birthDate: toDateInput(player.birthDate), gender: player.gender, skillRating: player.skillRating ?? player.effectiveSkillRating,
    membershipType: player.membershipType, joinedOn: toDateInput(player.joinedOn), status: player.status, notes: player.notes ?? '',
  }
}

/** Xem và sửa hồ sơ người chơi; playerId = "moi" là thêm mới. Request giống form web (phí tháng luôn 0). */
export default function PlayerEditScreen() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>()
  const isNew = playerId === 'moi'
  const { canManage } = usePermissions()
  const { data, error, loading, reload } = useLoad(async () => (isNew || !canManage ? null : getPlayer(playerId)), playerId)
  const title = isNew ? 'Thêm người chơi' : 'Hồ sơ người chơi'

  if (!canManage) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title }} />
        <EmptyState icon="lock-outline" title="Không có quyền sửa hồ sơ" message="Chỉ Quản trị và Hỗ trợ được thêm và sửa người chơi." />
      </View>
    )
  }
  if (loading) return <><Stack.Screen options={{ title }} /><Loading /></>
  if (error || (!isNew && !data)) return <><Stack.Screen options={{ title }} /><ErrorState message={error ?? 'Không tải được hồ sơ.'} onRetry={() => void reload()} /></>
  return <><Stack.Screen options={{ title }} /><PlayerForm key={data?.updatedAtUtc ?? 'new'} player={data} /></>
}

function PlayerForm({ player }: { player: PlayerDetail | null }) {
  const notify = useToast()
  const insets = useSafeAreaInsets()
  const { canBill } = usePermissions()
  const [form, setForm] = useState<FormModel>(() => initialForm(player))
  const [errors, setErrors] = useState<Errors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [skillOpen, setSkillOpen] = useState(false)

  const set = <K extends keyof FormModel>(field: K, value: FormModel[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => { const next = { ...current }; delete next[field as FieldKey]; return next })
  }

  const validate = (): { errors: Errors; birthDate: string | null; joinedOn: string | null } => {
    const next: Errors = {}
    if (!form.memberCode.trim()) next.memberCode = 'Mã người chơi là bắt buộc.'
    if (!form.fullName.trim()) next.fullName = 'Họ tên là bắt buộc.'
    else if (form.fullName.trim().length < 2) next.fullName = 'Họ tên phải có ít nhất 2 ký tự.'
    const email = form.email.trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Email chưa đúng định dạng.'
    const birthDate = form.birthDate.trim() ? parseDateInput(form.birthDate) : null
    if (form.birthDate.trim() && !birthDate) next.birthDate = 'Nhập ngày dạng dd/MM/yyyy.'
    const joinedOn = parseDateInput(form.joinedOn)
    if (!joinedOn) next.joinedOn = 'Nhập ngày tham gia dạng dd/MM/yyyy.'
    return { errors: next, birthDate, joinedOn }
  }

  const save = async () => {
    const checked = validate()
    setErrors(checked.errors)
    if (Object.keys(checked.errors).length > 0) { setSubmitError('Kiểm tra lại các ô báo lỗi.'); return }
    setSaving(true)
    setSubmitError(null)
    const input: UpsertPlayerInput = {
      memberCode: form.memberCode.trim(),
      fullName: form.fullName.trim(),
      phoneNumber: form.phoneNumber.trim() || null,
      email: form.email.trim() || null,
      birthDate: checked.birthDate,
      gender: form.gender,
      skillLevel: legacySkillLevel(form.skillRating),
      membershipType: form.membershipType,
      joinedOn: checked.joinedOn!,
      monthlyFee: 0,
      status: form.status,
      notes: form.notes.trim() || null,
      // Liên kết tài khoản đăng nhập không sửa ở đây (web cũng chỉ giữ nguyên giá trị cũ).
      userId: player?.userId ?? null,
      skillRating: form.skillRating,
    }
    try {
      if (player) await updatePlayer(player.id, input)
      else await createPlayer(input)
      notify('success', player ? 'Đã cập nhật hồ sơ người chơi.' : 'Đã thêm người chơi.')
      router.back()
    } catch (saveError) {
      setErrors(fieldErrorsFrom(saveError, serverFields))
      setSubmitError(errorMessage(saveError, 'Không thể lưu người chơi.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingVertical: 12, paddingBottom: 110, gap: 12 }}>
        {player && (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={player.fullName} seed={player.id} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.ink }}>{player.fullName}</Text>
              <Text style={{ fontSize: font.caption, color: colors.muted }}>{player.memberCode} · {membershipLabels[player.membershipType]} · {playerStatusLabels[player.status]}</Text>
              <Text style={{ fontSize: font.caption, color: colors.muted }}>Tham gia từ {toDateInput(player.joinedOn)}{player.userId ? ' · đã liên kết tài khoản đăng nhập' : ''}</Text>
              {canBill && <Text style={{ fontSize: font.caption, color: colors.money, marginTop: 2 }}>Số dư có: {formatVnd(player.creditBalance)}</Text>}
            </View>
          </Card>
        )}
        {submitError && <Banner tone="danger" icon="alert-circle-outline" text={submitError} />}

        <SectionTitle>Thông tin cơ bản</SectionTitle>
        <Card style={{ gap: 12 }}>
          <Field label="Mã người chơi" required error={errors.memberCode}>
            <Input value={form.memberCode} maxLength={40} autoCapitalize="characters" onChangeText={(value) => set('memberCode', value)} invalid={Boolean(errors.memberCode)} />
          </Field>
          <Field label="Họ và tên" required error={errors.fullName}>
            <Input value={form.fullName} maxLength={160} autoCapitalize="words" onChangeText={(value) => set('fullName', value)} invalid={Boolean(errors.fullName)} />
          </Field>
          <Field label="Số điện thoại" error={errors.phoneNumber}>
            <Input value={form.phoneNumber} maxLength={20} keyboardType="phone-pad" onChangeText={(value) => set('phoneNumber', value)} invalid={Boolean(errors.phoneNumber)} />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input value={form.email} maxLength={200} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} onChangeText={(value) => set('email', value)} invalid={Boolean(errors.email)} />
          </Field>
          <Field label="Ngày sinh" error={errors.birthDate} hint="dd/MM/yyyy, để trống nếu chưa rõ">
            <Input value={form.birthDate} maxLength={10} placeholder="VD: 15/08/1990" keyboardType="numbers-and-punctuation" onChangeText={(value) => set('birthDate', value)} invalid={Boolean(errors.birthDate)} />
          </Field>
          <Field label="Giới tính">
            <Choices<PlayerGender | null>
              value={form.gender}
              options={[{ value: null, label: 'Chưa cập nhật' }, ...(Object.keys(genderLabels) as PlayerGender[]).map((value) => ({ value, label: genderLabels[value] }))]}
              onChange={(value) => set('gender', value)}
            />
          </Field>
        </Card>

        <SectionTitle>Câu lạc bộ</SectionTitle>
        <Card style={{ gap: 12 }}>
          <Field label="Trình độ" error={errors.skillRating} hint="Dùng để chia cặp cân bằng khi chia trận.">
            <Pressable accessibilityRole="button" onPress={() => setSkillOpen(true)} style={[styles.input, styles.select]}>
              <Text style={{ flex: 1, fontSize: font.body, color: colors.ink }}>{form.skillRating}. {skillLevelLabels[form.skillRating - 1]}</Text>
              <Icon name="chevron-down" color={colors.muted} />
            </Pressable>
          </Field>
          <Field label="Loại người chơi">
            <Choices value={form.membershipType} options={(Object.keys(membershipLabels) as PlayerMembershipType[]).map((value) => ({ value, label: membershipLabels[value] }))} onChange={(value) => set('membershipType', value)} />
          </Field>
          <Field label="Ngày tham gia" required error={errors.joinedOn} hint="dd/MM/yyyy">
            <Input value={form.joinedOn} maxLength={10} keyboardType="numbers-and-punctuation" onChangeText={(value) => set('joinedOn', value)} invalid={Boolean(errors.joinedOn)} />
          </Field>
          <Field label="Trạng thái">
            <Choices value={form.status} options={(Object.keys(playerStatusLabels) as PlayerStatus[]).map((value) => ({ value, label: playerStatusLabels[value] }))} onChange={(value) => set('status', value)} />
          </Field>
          <Field label="Ghi chú" error={errors.notes}>
            <Input value={form.notes} maxLength={1000} multiline onChangeText={(value) => set('notes', value)} invalid={Boolean(errors.notes)} style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }} />
          </Field>
        </Card>
        <Text style={{ fontSize: font.caption, color: colors.muted, marginHorizontal: 16 }}>Nhập/xuất danh sách người chơi bằng Excel dùng trên bản web.</Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label="Hủy" tone="outline" onPress={() => router.back()} disabled={saving} style={{ flex: 1 }} />
        <Button label={player ? 'Lưu hồ sơ' : 'Thêm người chơi'} icon="content-save-outline" busy={saving} onPress={() => void save()} style={{ flex: 2 }} />
      </View>

      <Modal visible={skillOpen} animationType="slide" transparent onRequestClose={() => setSkillOpen(false)}>
        <SkillPicker value={form.skillRating} onChoose={(rating) => { set('skillRating', rating); setSkillOpen(false) }} onClose={() => setSkillOpen(false)} />
      </Modal>
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

function Choices<T>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((option) => {
        const on = option.value === value
        return (
          <Pressable key={option.label} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(option.value)} style={[styles.choice, on && styles.choiceOn]}>
            <Text style={{ fontSize: font.small, color: on ? '#fff' : colors.ink, fontWeight: on ? '600' : '400' }}>{option.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function SkillPicker({ value, onChoose, onClose }: { value: number; onChoose: (rating: number) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={styles.sheetBackdrop}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ flex: 1, fontSize: font.body, fontWeight: '700', color: colors.ink }}>Chọn trình độ</Text>
          <Pressable accessibilityLabel="Đóng" onPress={onClose} hitSlop={12}><Icon name="close" /></Pressable>
        </View>
        <FlatList
          data={skillLevelLabels.map((label, index) => ({ label, rating: index + 1 }))}
          keyExtractor={(item) => String(item.rating)}
          renderItem={({ item }) => (
            <Pressable onPress={() => onChoose(item.rating)} style={[styles.pickRow, item.rating === value && { backgroundColor: colors.brandSoft }]}>
              <Text style={{ width: 28, fontSize: font.body, fontWeight: '700', color: colors.brandMid }}>{item.rating}</Text>
              <Text style={{ flex: 1, fontSize: font.body, color: colors.ink }}>{item.label}</Text>
              {item.rating === value && <Icon name="check" color={colors.brand} />}
            </Pressable>
          )}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: font.small, fontWeight: '600', color: colors.ink },
  error: { fontSize: font.caption, color: colors.danger },
  hint: { fontSize: font.caption, color: colors.muted },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, fontSize: font.body, color: colors.ink, backgroundColor: '#fff' },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  choiceOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: '75%' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 8, borderRadius: 12 },
})
