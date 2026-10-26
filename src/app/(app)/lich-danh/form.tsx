import { router, Stack, useLocalSearchParams, usePreventRemove, type Href } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth, usePermissions } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { bangkokToday, formatVnd } from '@/lib/format'
import {
  addDays, bangkokParts, cancelSession, createRecurringSessions, createSession, fieldErrorsFrom, getAdminSession, getOrganizers,
  getSchedulingCourts, getVenues, parseDateInput, parseTimeInput, toDateInput, updateSession, weekdayNames, weekdayOf,
  type AdminPlaySession, type Court, type OrganizerOption, type UpsertPlaySessionInput, type Venue,
} from '@/lib/services/admin'
import { useLoad } from '@/lib/useLoad'
import { Banner, Button, Card, EmptyState, ErrorState, Icon, Loading, SectionTitle } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

type Mode = 'create' | 'edit' | 'copy'
interface Booking { courtId: string; startsAt: string; endsAt: string }
interface FormModel {
  title: string
  venueId: string
  courtIds: string[]
  date: string
  startTime: string
  endTime: string
  deadlineDate: string
  deadlineTime: string
  maxParticipants: string
  courtCount: number
  courtFee: string
  courtActualCost: string
  organizerId: string
  status: 'draft' | 'open'
  notes: string
  repeatsWeekly: boolean
  repeatUntil: string
}
type FieldKey = 'title' | 'venueId' | 'courts' | 'date' | 'startTime' | 'endTime' | 'deadline' | 'maxParticipants' | 'courtCount' | 'courtFee' | 'courtActualCost' | 'organizerId' | 'status' | 'notes' | 'repeatUntil'
type Errors = Partial<Record<FieldKey, string>>

const serverFields: Record<string, FieldKey> = {
  Title: 'title', VenueId: 'venueId', CourtIds: 'courts', CourtBookings: 'courts', StartsAt: 'startTime', EndsAt: 'endTime', RegistrationDeadline: 'deadline',
  MaxParticipants: 'maxParticipants', CourtCount: 'courtCount', CourtFee: 'courtFee', CourtActualCost: 'courtActualCost', OrganizerId: 'organizerId', Status: 'status', Notes: 'notes', RepeatUntil: 'repeatUntil',
}
const lockedStatuses = ['cancelled', 'completed', 'costClosed']
const MAX_COURTS = 20

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n${message}`)) onConfirm(); return }
  Alert.alert(title, message, [{ text: 'Không', style: 'cancel' }, { text: 'Đồng ý', style: 'destructive', onPress: onConfirm }])
}

/** "Cầu lông Thứ ba 27/10" — tên mặc định giống web khi để trống. */
function defaultTitle(isoDate: string | null) {
  if (!isoDate) return 'Lịch đánh cầu'
  const [, month, day] = isoDate.split('-')
  return `Cầu lông ${weekdayNames[weekdayOf(isoDate)]} ${day}/${month}`
}

/** Mã lịch như web (server vẫn tự sinh mã duy nhất): T3 27 10 2026 19 → "T32710202619". */
function buildSessionCode(isoDate: string, time: string) {
  const [year, month, day] = isoDate.split('-')
  return `${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][weekdayOf(isoDate)]}${day}${month}${year}${time.slice(0, 2)}`
}

const localOf = (utc: string, shiftDays: number) => { const parts = bangkokParts(utc); return `${addDays(parts.date, shiftDays)}T${parts.time}` }
const toServer = (local: string) => `${local}:00+07:00`

function initialState(mode: Mode, session: AdminPlaySession | null, organizers: OrganizerOption[], currentUserId: string | undefined) {
  const preferredOrganizer = organizers.find((item) => item.id === currentUserId)?.id ?? organizers[0]?.id ?? ''
  if (!session) {
    const date = addDays(bangkokToday(), 1)
    const form: FormModel = {
      title: '', venueId: '', courtIds: [], date: toDateInput(date), startTime: '19:00', endTime: '21:00', deadlineDate: '', deadlineTime: '',
      maxParticipants: '100', courtCount: 1, courtFee: '', courtActualCost: '', organizerId: preferredOrganizer, status: 'open', notes: '',
      repeatsWeekly: false, repeatUntil: toDateInput(addDays(date, 28)),
    }
    return { form, bookings: [] as Booking[] }
  }
  // Sao chép: dời sang tuần sau, giữ giờ, sân và tiền sân như web.
  const shift = mode === 'copy' ? 7 : 0
  const start = localOf(session.startsAtUtc, shift)
  const end = localOf(session.endsAtUtc, shift)
  const deadline = localOf(session.registrationDeadlineUtc, shift)
  const bookings: Booking[] = session.courts.map((court) => ({ courtId: court.courtId || court.id, startsAt: localOf(court.startsAtUtc || session.startsAtUtc, shift), endsAt: localOf(court.endsAtUtc || session.endsAtUtc, shift) }))
  const form: FormModel = {
    title: session.title,
    venueId: session.venueId,
    courtIds: [...new Set(bookings.map((booking) => booking.courtId))],
    date: toDateInput(start.slice(0, 10)),
    startTime: start.slice(11),
    endTime: end.slice(11),
    deadlineDate: deadline === start ? '' : toDateInput(deadline.slice(0, 10)),
    deadlineTime: deadline === start ? '' : deadline.slice(11),
    maxParticipants: String(session.maxParticipants),
    courtCount: session.courtCount || 1,
    courtFee: session.courtFee !== null && session.courtFee !== undefined ? String(session.courtFee) : '',
    courtActualCost: session.courtActualCost !== null && session.courtActualCost !== undefined ? String(session.courtActualCost) : '',
    organizerId: organizers.some((item) => item.id === session.organizerId) ? session.organizerId : preferredOrganizer,
    status: mode === 'edit' && session.status === 'draft' ? 'draft' : 'open',
    notes: session.notes ?? '',
    repeatsWeekly: false,
    repeatUntil: toDateInput(addDays(start.slice(0, 10), 28)),
  }
  return { form, bookings }
}

/** Tạo lịch đánh; ?id= là sửa, ?copyFrom= là sao chép sang tuần sau. Sửa còn có nút hủy lịch kèm lý do. */
export default function SessionFormScreen() {
  const { id, copyFrom } = useLocalSearchParams<{ id?: string; copyFrom?: string }>()
  const mode: Mode = id ? 'edit' : copyFrom ? 'copy' : 'create'
  const sourceId = id ?? copyFrom ?? ''
  const { canManage } = usePermissions()
  const currentUserId = useAuth().user?.id
  const { data, error, loading, reload } = useLoad(async () => {
    if (!canManage) return null
    const [venues, courts, organizers, session] = await Promise.all([getVenues(true), getSchedulingCourts(), getOrganizers(), sourceId ? getAdminSession(sourceId) : Promise.resolve(null)])
    return { venues, courts, organizers, session }
  }, `${mode}|${sourceId}`)

  const title = mode === 'edit' ? `Sửa ${data?.session?.code ?? 'lịch đánh'}` : mode === 'copy' ? `Sao chép ${data?.session?.code ?? 'lịch đánh'}` : 'Tạo lịch đánh'
  if (!canManage) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title }} />
        <EmptyState icon="lock-outline" title="Không có quyền tạo lịch" message="Chỉ Quản trị và Hỗ trợ được tạo, sửa và hủy lịch đánh." />
      </View>
    )
  }
  if (loading) return <><Stack.Screen options={{ title }} /><Loading /></>
  if (error || !data) return <><Stack.Screen options={{ title }} /><ErrorState message={error ?? 'Không tải được dữ liệu tạo lịch.'} onRetry={() => void reload()} /></>
  if (data.venues.length === 0 || data.organizers.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title }} />
        <EmptyState icon="map-marker-off-outline" title="Chưa thể tạo lịch" message={data.venues.length === 0 ? 'Chưa có địa điểm đang hoạt động. Thêm địa điểm ở mục Địa điểm & sân.' : 'Chưa có người tổ chức (Quản trị/Hỗ trợ) đang hoạt động.'} />
      </View>
    )
  }
  return (
    <>
      <Stack.Screen options={{ title }} />
      <SessionForm key={`${mode}|${sourceId}`} mode={mode} session={data.session} venues={data.venues} courts={data.courts} organizers={data.organizers} currentUserId={currentUserId} />
    </>
  )
}

function SessionForm({ mode, session, venues, courts, organizers, currentUserId }: { mode: Mode; session: AdminPlaySession | null; venues: Venue[]; courts: Court[]; organizers: OrganizerOption[]; currentUserId: string | undefined }) {
  const notify = useToast()
  const insets = useSafeAreaInsets()
  const { canBill } = usePermissions()
  const [initial] = useState(() => initialState(mode, session, organizers, currentUserId))
  const [form, setForm] = useState<FormModel>(initial.form)
  const [errors, setErrors] = useState<Errors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial.form)

  const locked = mode === 'edit' && session !== null && lockedStatuses.includes(session.status)
  const cancellable = mode === 'edit' && session !== null && !lockedStatuses.includes(session.status)

  // Hỏi lại trước khi rời form còn thay đổi chưa lưu (giống hộp "Bỏ thay đổi chưa lưu?" của web).
  const disablePrevention = usePreventRemove(dirty && !saving && !leaving, ({ repeat }) => {
    confirmAction('Bỏ thay đổi chưa lưu?', 'Các nội dung vừa nhập sẽ không được lưu.', () => { setLeaving(true); repeat() })
  })

  const leave = () => { setLeaving(true); disablePrevention(); router.back() }
  const set = <K extends keyof FormModel>(field: K, value: FormModel[K], errorKey?: FieldKey) => {
    setForm((current) => ({ ...current, [field]: value }))
    const key = errorKey ?? (field as FieldKey)
    setErrors((current) => { const next = { ...current }; delete next[key]; return next })
  }

  const venueOptions = venues.some((venue) => venue.id === form.venueId) || !session || form.venueId !== session.venueId
    ? venues
    : [...venues, { id: session.venueId, name: `${session.venueName} (ngừng hoạt động)` } as Venue]
  const venueCourts = courts.filter((court) => court.venueId === form.venueId)
  // Sân đã chọn nhưng nay ngừng hoạt động vẫn hiện để bỏ chọn (server sẽ từ chối sân ngừng hoạt động).
  const extraCourts = session ? session.courts.filter((court, index, all) => all.findIndex((item) => item.courtId === court.courtId) === index && form.courtIds.includes(court.courtId) && !venueCourts.some((item) => item.id === court.courtId)) : []

  const toggleCourt = (courtId: string) => set('courtIds', form.courtIds.includes(courtId) ? form.courtIds.filter((value) => value !== courtId) : [...form.courtIds, courtId], 'courts')
  const shiftDate = (field: 'date' | 'deadlineDate' | 'repeatUntil', days: number) => {
    const base = parseDateInput(form[field]) ?? parseDateInput(form.date) ?? bangkokToday()
    set(field, toDateInput(addDays(base, days)), field === 'date' ? 'date' : field === 'deadlineDate' ? 'deadline' : 'repeatUntil')
  }

  const buildInput = (): { input: UpsertPlaySessionInput; repeatUntil: string | null } | { errors: Errors } => {
    const next: Errors = {}
    const date = parseDateInput(form.date)
    const start = parseTimeInput(form.startTime)
    const end = parseTimeInput(form.endTime)
    if (!form.venueId) next.venueId = 'Hãy chọn địa điểm.'
    if (!date) next.date = 'Nhập ngày dạng dd/MM/yyyy.'
    if (!start) next.startTime = 'Nhập giờ dạng HH:mm.'
    if (!end) next.endTime = 'Nhập giờ dạng HH:mm.'
    if (start && end && end <= start) next.endTime = 'Giờ kết thúc phải sau giờ bắt đầu.'
    const title = form.title.trim()
    if (title && (title.length < 2 || title.length > 160)) next.title = 'Tên lịch đánh phải từ 2 đến 160 ký tự.'
    let deadline: string | null = null
    if (form.deadlineDate.trim() || form.deadlineTime.trim()) {
      const deadlineDate = parseDateInput(form.deadlineDate)
      const deadlineTime = parseTimeInput(form.deadlineTime)
      if (!deadlineDate || !deadlineTime) next.deadline = 'Nhập đủ ngày (dd/MM/yyyy) và giờ (HH:mm), hoặc để trống cả hai.'
      else {
        deadline = `${deadlineDate}T${deadlineTime}`
        if (date && start && deadline > `${date}T${start}`) next.deadline = 'Hạn đăng ký không được sau giờ bắt đầu.'
      }
    }
    const max = Number(form.maxParticipants)
    if (!/^\d+$/.test(form.maxParticipants.trim()) || max < 1 || max > 10000) next.maxParticipants = 'Số người phải từ 1 đến 10.000.'
    if (form.courtCount < 1 || form.courtCount > MAX_COURTS) next.courtCount = `Số sân phải từ 1 đến ${MAX_COURTS}.`
    // Tiền sân chỉ bắt buộc với người được thấy tiền; Hỗ trợ không nhập (server giữ nguyên tiền sân cũ).
    if (canBill && form.courtFee.trim() === '') next.courtFee = 'Hãy nhập tiền sân (nhập 0 nếu miễn phí).'
    if (!form.organizerId) next.organizerId = 'Hãy chọn người tổ chức.'
    if (form.notes.length > 2000) next.notes = 'Ghi chú không được vượt quá 2.000 ký tự.'
    let repeatUntil: string | null = null
    if (mode !== 'edit' && form.repeatsWeekly) {
      repeatUntil = parseDateInput(form.repeatUntil)
      if (!repeatUntil) next.repeatUntil = 'Nhập ngày dạng dd/MM/yyyy.'
      else if (date && repeatUntil < date) next.repeatUntil = 'Ngày kết thúc phải từ ngày lịch đầu tiên trở đi.'
      else if (date && (Date.parse(`${repeatUntil}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000 / 7 >= 52) next.repeatUntil = 'Một lịch lặp không được vượt quá 52 tuần.'
    }
    if (Object.keys(next).length > 0 || !date || !start || !end) return { errors: next }

    const defaultStart = `${date}T${start}`
    const defaultEnd = `${date}T${end}`
    // Giữ khung giờ riêng của từng sân (đặt trên web) khi chưa đổi ngày giờ; đổi ngày giờ thì mọi sân theo giờ của lịch.
    const sameTime = parseDateInput(initial.form.date) === date && parseTimeInput(initial.form.startTime) === start && parseTimeInput(initial.form.endTime) === end
    const bookings: Booking[] = form.courtIds.flatMap((courtId) => {
      const kept = sameTime ? initial.bookings.filter((booking) => booking.courtId === courtId) : []
      return kept.length ? kept : [{ courtId, startsAt: defaultStart, endsAt: defaultEnd }]
    })
    const rangeStart = bookings.length ? bookings.map((item) => item.startsAt).sort()[0] : defaultStart
    const rangeEnd = bookings.length ? bookings.map((item) => item.endsAt).sort()[bookings.length - 1] : defaultEnd
    const finalDeadline = deadline && deadline <= rangeStart ? deadline : rangeStart
    return {
      repeatUntil,
      input: {
        code: buildSessionCode(date, start),
        title: title || defaultTitle(date),
        venueId: form.venueId,
        startsAt: toServer(rangeStart),
        endsAt: toServer(rangeEnd),
        maxParticipants: max,
        registrationDeadline: toServer(finalDeadline),
        organizerId: form.organizerId,
        courtIds: bookings.map((booking) => booking.courtId),
        courtBookings: bookings.length ? bookings.map((booking) => ({ courtId: booking.courtId, startsAt: toServer(booking.startsAt), endsAt: toServer(booking.endsAt) })) : undefined,
        notes: form.notes.trim(),
        status: form.status,
        courtFee: canBill && form.courtFee.trim() !== '' ? Number(form.courtFee) : null,
        courtActualCost: canBill && form.courtActualCost.trim() !== '' ? Number(form.courtActualCost) : null,
        courtCount: form.courtCount,
      },
    }
  }

  const save = async () => {
    const built = buildInput()
    if ('errors' in built) { setErrors(built.errors); setSubmitError('Kiểm tra lại các ô báo lỗi.'); return }
    setErrors({})
    setSubmitError(null)
    setSaving(true)
    try {
      if (mode === 'edit' && session) {
        await updateSession(session.id, built.input)
        notify('success', 'Đã cập nhật lịch đánh.')
      } else if (built.repeatUntil) {
        const created = await createRecurringSessions(built.input, built.repeatUntil)
        notify('success', `Đã tạo ${created.length} lịch đánh lặp hằng tuần.`)
      } else {
        await createSession(built.input)
        notify('success', mode === 'copy' ? 'Đã sao chép thành lịch đánh mới.' : 'Đã tạo lịch đánh mới.')
      }
      leave()
    } catch (saveError) {
      setErrors(fieldErrorsFrom(saveError, serverFields))
      setSubmitError(errorMessage(saveError, 'Không thể lưu lịch đánh.'))
    } finally {
      setSaving(false)
    }
  }

  const parsedDate = parseDateInput(form.date)
  const fee = form.courtFee.trim() === '' ? null : Number(form.courtFee)
  const actual = form.courtActualCost.trim() === '' ? null : Number(form.courtActualCost)
  const saveLabel = mode === 'edit' ? 'Lưu lịch đánh' : form.repeatsWeekly ? 'Tạo chuỗi lịch' : mode === 'copy' ? 'Tạo bản sao' : 'Tạo lịch đánh'

  if (locked && session) {
    return (
      <ScrollView contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        <Banner tone="warn" icon="lock-outline" text={session.status === 'cancelled' ? `Lịch đánh đã hủy${session.cancellationReason ? `: ${session.cancellationReason}` : ''}. Không thể chỉnh sửa lại.` : 'Lịch đánh đã hoàn thành hoặc đã chốt tiền nên không thể chỉnh sửa.'} />
        <Button label="Sao chép thành lịch mới" icon="content-copy" tone="outline" onPress={() => router.replace({ pathname: '/lich-danh/form', params: { copyFrom: session.id } } as unknown as Href)} style={{ marginHorizontal: 16 }} />
      </ScrollView>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ paddingVertical: 12, paddingBottom: 120, gap: 12 }}>
        <Text style={{ fontSize: font.caption, color: colors.muted, marginHorizontal: 16 }}>Giờ Việt Nam · các ô có dấu * là bắt buộc.</Text>
        {session?.seriesId && mode === 'edit' && <Banner tone="ok" icon="repeat" text="Thuộc lịch lặp: sửa lịch này không ảnh hưởng các tuần khác." />}
        {submitError && <Banner tone="danger" icon="alert-circle-outline" text={submitError} />}

        <SectionTitle>Thời gian</SectionTitle>
        <Card style={{ gap: 12 }}>
          <Field label="Ngày" required error={errors.date} hint={parsedDate ? weekdayNames[weekdayOf(parsedDate)] : 'dd/MM/yyyy'}>
            <DateInput value={form.date} onChange={(value) => set('date', value)} onShift={(days) => shiftDate('date', days)} invalid={Boolean(errors.date)} />
          </Field>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field label="Giờ bắt đầu" required error={errors.startTime}>
                <Input value={form.startTime} placeholder="19:00" maxLength={5} keyboardType="numbers-and-punctuation" onChangeText={(value) => set('startTime', value)} invalid={Boolean(errors.startTime)} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Giờ kết thúc" required error={errors.endTime}>
                <Input value={form.endTime} placeholder="21:00" maxLength={5} keyboardType="numbers-and-punctuation" onChangeText={(value) => set('endTime', value)} invalid={Boolean(errors.endTime)} />
              </Field>
            </View>
          </View>
        </Card>

        <SectionTitle>Địa điểm & sân</SectionTitle>
        <Card style={{ gap: 12 }}>
          <Field label="Địa điểm" required error={errors.venueId}>
            <Choices value={form.venueId} options={venueOptions.map((venue) => ({ value: venue.id, label: venue.name }))} onChange={(value) => { setForm((current) => ({ ...current, venueId: value, courtIds: [] })); setErrors((current) => ({ ...current, venueId: undefined, courts: undefined })) }} />
          </Field>
          <Field label={`Sân cụ thể${form.courtIds.length ? ` · đã chọn ${form.courtIds.length}` : ' · không bắt buộc'}`} error={errors.courts} hint={`Chọn sân để hệ thống cảnh báo trùng lịch sân.${canBill ? ' Tiền sân luôn lấy theo số nhập bên dưới.' : ''}`}>
            {!form.venueId ? <Text style={styles.hint}>Chọn địa điểm trước để xem sân.</Text>
              : venueCourts.length + extraCourts.length === 0 ? <Text style={styles.hint}>Địa điểm này chưa có sân đang hoạt động.</Text>
                : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {venueCourts.map((court) => <ToggleChip key={court.id} label={`${court.code} · ${court.name}`} on={form.courtIds.includes(court.id)} onPress={() => toggleCourt(court.id)} />)}
                    {extraCourts.map((court) => <ToggleChip key={court.courtId} label={`${court.code} (ngừng hoạt động)`} on onPress={() => toggleCourt(court.courtId)} />)}
                  </View>
                )}
          </Field>
          <Field label="Số sân đánh cùng lúc" required error={errors.courtCount} hint={`Mỗi lượt chia trận sẽ có ${form.courtCount} trận cùng lúc.`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable accessibilityLabel="Bớt 1 sân" disabled={form.courtCount <= 1} onPress={() => set('courtCount', Math.max(1, form.courtCount - 1))} style={[styles.stepper, form.courtCount <= 1 && { opacity: 0.4 }]}><Icon name="minus" color={colors.brand} /></Pressable>
              <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.ink, minWidth: 64, textAlign: 'center' }}>{form.courtCount} sân</Text>
              <Pressable accessibilityLabel="Thêm 1 sân" disabled={form.courtCount >= MAX_COURTS} onPress={() => set('courtCount', Math.min(MAX_COURTS, form.courtCount + 1))} style={[styles.stepper, form.courtCount >= MAX_COURTS && { opacity: 0.4 }]}><Icon name="plus" color={colors.brand} /></Pressable>
            </View>
          </Field>
        </Card>

        {canBill && (
          <>
            <SectionTitle>Tiền sân</SectionTitle>
            <Card style={{ gap: 12 }}>
              <Field label="Tiền sân niêm yết (VNĐ)" required error={errors.courtFee} hint={fee !== null ? `${formatVnd(fee)} · dùng để chia tiền cho người chơi` : 'Dùng để chia tiền cho người chơi'}>
                <Input value={form.courtFee} placeholder="VD: 300000" keyboardType="number-pad" maxLength={12} onChangeText={(value) => set('courtFee', value.replace(/\D/g, ''))} invalid={Boolean(errors.courtFee)} />
              </Field>
              <Field label="Tiền sân thực trả (VNĐ)" error={errors.courtActualCost} hint={actual !== null ? `${formatVnd(actual)} · trả cho chủ sân, chỉ dùng để đối soát` : 'Để trống = bằng giá niêm yết'}>
                <Input value={form.courtActualCost} placeholder="Để trống = bằng giá niêm yết" keyboardType="number-pad" maxLength={12} onChangeText={(value) => set('courtActualCost', value.replace(/\D/g, ''))} invalid={Boolean(errors.courtActualCost)} />
              </Field>
            </Card>
          </>
        )}

        <SectionTitle>Đăng ký & tổ chức</SectionTitle>
        <Card style={{ gap: 12 }}>
          <Field label="Trạng thái" error={errors.status}>
            <Choices<'draft' | 'open'> value={form.status} options={[{ value: 'draft', label: 'Nháp' }, { value: 'open', label: 'Mở đăng ký' }]} onChange={(value) => set('status', value)} />
          </Field>
          <Field label="Số người tối đa" required error={errors.maxParticipants} hint="Quá số này người đăng ký sẽ vào danh sách chờ.">
            <Input value={form.maxParticipants} keyboardType="number-pad" maxLength={5} onChangeText={(value) => set('maxParticipants', value.replace(/\D/g, ''))} invalid={Boolean(errors.maxParticipants)} />
          </Field>
          <Field label="Hạn đăng ký" error={errors.deadline} hint="Để trống = đến giờ bắt đầu. Không được sau giờ bắt đầu.">
            <View style={{ gap: 8 }}>
              <DateInput value={form.deadlineDate} placeholder="dd/MM/yyyy" onChange={(value) => set('deadlineDate', value, 'deadline')} onShift={(days) => shiftDate('deadlineDate', days)} invalid={Boolean(errors.deadline)} />
              <Input value={form.deadlineTime} placeholder="HH:mm" maxLength={5} keyboardType="numbers-and-punctuation" onChangeText={(value) => set('deadlineTime', value, 'deadline')} invalid={Boolean(errors.deadline)} />
            </View>
          </Field>
          <Field label="Người tổ chức" required error={errors.organizerId}>
            <Choices value={form.organizerId} options={organizers.map((item) => ({ value: item.id, label: item.displayName }))} onChange={(value) => set('organizerId', value)} />
          </Field>
        </Card>

        <SectionTitle>Khác</SectionTitle>
        <Card style={{ gap: 12 }}>
          <Field label="Tên lịch đánh" error={errors.title} hint={`Để trống sẽ dùng “${defaultTitle(parsedDate)}”.`}>
            <Input value={form.title} placeholder={defaultTitle(parsedDate)} maxLength={160} onChangeText={(value) => set('title', value)} invalid={Boolean(errors.title)} />
          </Field>
          <Field label="Ghi chú" error={errors.notes} hint={`${form.notes.length}/2000`}>
            <Input value={form.notes} maxLength={2000} multiline onChangeText={(value) => set('notes', value)} invalid={Boolean(errors.notes)} style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }} />
          </Field>
        </Card>

        {mode !== 'edit' && (
          <Card style={{ gap: 12, marginTop: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
              <Icon name="repeat" color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Lặp hằng tuần</Text>
                <Text style={styles.hint}>Mỗi tuần tạo một lịch đánh riêng, cùng giờ{canBill ? ' và tiền sân' : ''}; có thể sửa từng lịch.</Text>
              </View>
              <Switch value={form.repeatsWeekly} onValueChange={(value) => set('repeatsWeekly', value, 'repeatUntil')} trackColor={{ true: colors.brandMid, false: colors.line }} thumbColor="#fff" />
            </View>
            {form.repeatsWeekly && (
              <Field label="Lặp đến hết ngày" required error={errors.repeatUntil} hint="Tối đa 52 tuần.">
                <DateInput value={form.repeatUntil} onChange={(value) => set('repeatUntil', value)} onShift={(days) => shiftDate('repeatUntil', days * 7)} invalid={Boolean(errors.repeatUntil)} />
              </Field>
            )}
          </Card>
        )}

        {cancellable && (
          <>
            <SectionTitle>Hủy lịch</SectionTitle>
            <Card style={{ gap: 10 }}>
              <Text style={styles.hint}>Lịch đánh đã hủy không thể chỉnh sửa lại. Lý do hủy được lưu vào lịch sử.</Text>
              <Button label="Hủy lịch đánh" tone="danger" icon="cancel" onPress={() => setCancelOpen(true)} disabled={saving} />
            </Card>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label="Đóng" tone="outline" onPress={() => router.back()} disabled={saving} style={{ flex: 1 }} />
        <Button label={saveLabel} icon={mode === 'copy' ? 'content-copy' : 'check'} busy={saving} onPress={() => void save()} style={{ flex: 2 }} />
      </View>

      {session && (
        <Modal visible={cancelOpen} animationType="slide" transparent onRequestClose={() => setCancelOpen(false)}>
          <CancelSheet session={session} onClose={() => setCancelOpen(false)} onCancelled={() => { setCancelOpen(false); notify('success', 'Đã hủy lịch đánh.'); leave() }} />
        </Modal>
      )}
    </View>
  )
}

function CancelSheet({ session, onClose, onCancelled }: { session: AdminPlaySession; onClose: () => void; onCancelled: () => void }) {
  const insets = useSafeAreaInsets()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (reason.trim().length < 3) { setError('Lý do hủy phải có ít nhất 3 ký tự.'); return }
    setBusy(true)
    setError(null)
    try {
      await cancelSession(session.id, reason.trim())
      onCancelled()
    } catch (cancelError) {
      setError(errorMessage(cancelError, 'Không thể hủy lịch đánh.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <View style={styles.sheetBackdrop}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12, gap: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: font.body, fontWeight: '700', color: colors.ink }}>Hủy lịch {session.code}</Text>
          <Pressable accessibilityLabel="Đóng" onPress={onClose} hitSlop={12}><Icon name="close" /></Pressable>
        </View>
        <Text style={styles.hint}>Lịch đánh đã hủy không thể chỉnh sửa lại.</Text>
        <Field label="Lý do hủy" required error={error ?? undefined} hint={`${reason.length}/500`}>
          <Input value={reason} autoFocus maxLength={500} multiline placeholder="Nhập lý do để lưu vào lịch sử…" onChangeText={(value) => { setReason(value); setError(null) }} invalid={Boolean(error)} style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }} />
        </Field>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label="Không hủy" tone="outline" onPress={onClose} disabled={busy} style={{ flex: 1 }} />
          <Button label="Xác nhận hủy" tone="danger" icon="cancel" busy={busy} onPress={() => void submit()} style={{ flex: 1 }} />
        </View>
      </View>
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

/** Ô ngày dd/MM/yyyy kèm nút lùi/tiến (không dùng thư viện chọn ngày). */
function DateInput({ value, placeholder = 'dd/MM/yyyy', invalid, onChange, onShift }: { value: string; placeholder?: string; invalid?: boolean; onChange: (value: string) => void; onShift: (days: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable accessibilityLabel="Lùi một ngày" onPress={() => onShift(-1)} style={styles.stepper}><Icon name="chevron-left" color={colors.brand} /></Pressable>
      <Input value={value} placeholder={placeholder} maxLength={10} keyboardType="numbers-and-punctuation" onChangeText={onChange} invalid={invalid} style={{ flex: 1, textAlign: 'center' }} />
      <Pressable accessibilityLabel="Tiến một ngày" onPress={() => onShift(1)} style={styles.stepper}><Icon name="chevron-right" color={colors.brand} /></Pressable>
    </View>
  )
}

function Choices<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((option) => <ToggleChip key={option.value} label={option.label} on={option.value === value} onPress={() => onChange(option.value)} />)}
    </View>
  )
}

function ToggleChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[styles.choice, on && styles.choiceOn]}>
      {on && <Icon name="check" size={15} color="#fff" />}
      <Text style={{ fontSize: font.small, color: on ? '#fff' : colors.ink, fontWeight: on ? '600' : '400' }}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: font.small, fontWeight: '600', color: colors.ink },
  error: { fontSize: font.caption, color: colors.danger },
  hint: { fontSize: font.caption, color: colors.muted },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, fontSize: font.body, color: colors.ink, backgroundColor: '#fff' },
  stepper: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  choiceOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 },
})
