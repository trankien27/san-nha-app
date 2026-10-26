import { Stack, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePermissions } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { getRoster, getSession } from '@/lib/endpoints'
import { formatTime, formatWeekdayDate } from '@/lib/format'
import { addRegistration, getRegistrationPlayers, removeRegistration, type RegistrationPlayerOption } from '@/lib/services/admin'
import type { RegistrationRoster, RegistrationView } from '@/lib/types'
import { useLoad } from '@/lib/useLoad'
import { Avatar, Banner, Button, Card, Chip, EmptyState, ErrorState, Icon, Loading, SectionTitle } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n${message}`)) onConfirm(); return }
  Alert.alert(title, message, [{ text: 'Không', style: 'cancel' }, { text: 'Đồng ý', style: 'destructive', onPress: onConfirm }])
}

/** Người tổ chức đăng ký hộ / gỡ người chơi khỏi lịch đánh; quá sức chứa thì vào danh sách chờ theo thứ tự. */
export default function RegistrationsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { canManage } = usePermissions()
  const notify = useToast()
  const insets = useSafeAreaInsets()
  const [busy, setBusy] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const { data, setData, error, loading, refreshing, reload } = useLoad(async () => {
    const [session, roster] = await Promise.all([getSession(id), getRoster(id)])
    // Mốc thời gian lấy lúc tải để biết lịch đã bắt đầu chưa (không gọi Date.now trong lúc render).
    return { session, roster, loadedAt: Date.now() }
  }, id)

  if (!canManage) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: 'Đăng ký' }} />
        <EmptyState icon="lock-outline" title="Không có quyền quản lý đăng ký" message="Chỉ Quản trị và Hỗ trợ được thêm hoặc gỡ người chơi." />
      </View>
    )
  }
  if (loading) return <><Stack.Screen options={{ title: 'Đăng ký' }} /><Loading /></>
  if (error || !data) return <><Stack.Screen options={{ title: 'Đăng ký' }} /><ErrorState message={error ?? 'Không tải được danh sách đăng ký.'} onRetry={() => void reload()} /></>

  const { session, roster, loadedAt } = data
  const setRoster = (next: RegistrationRoster) => setData({ session, roster: next, loadedAt })
  // Server chỉ cho gỡ khi lịch chưa bắt đầu và chưa hủy/hoàn thành/chốt tiền.
  const canRemove = new Date(session.startsAtUtc).getTime() > loadedAt && !['cancelled', 'completed', 'costClosed'].includes(session.status)
  const inRoster = new Set([...roster.registered, ...roster.waitlisted].map((row) => row.playerId))

  const remove = (row: RegistrationView) => confirmAction('Gỡ người chơi', `Gỡ ${row.playerName} khỏi lịch đánh?${row.status !== 'waitlisted' && roster.waitlisted.length > 0 ? ' Người đầu danh sách chờ sẽ được lên thay.' : ''}`, () => void (async () => {
    setBusy(row.playerId)
    try {
      setRoster(await removeRegistration(id, row.playerId))
      notify('success', `Đã gỡ ${row.playerName}.`)
    } catch (removeError) {
      notify('error', errorMessage(removeError, 'Không gỡ được người chơi.'))
    } finally {
      setBusy(null)
    }
  })())

  const add = async (option: RegistrationPlayerOption) => {
    setBusy(option.id)
    try {
      const next = await addRegistration(id, option.id)
      setRoster(next)
      const waitlisted = next.waitlisted.some((row) => row.playerId === option.id)
      notify('success', waitlisted ? `Đã thêm ${option.displayName} vào danh sách chờ.` : `Đã đăng ký cho ${option.displayName}.`)
    } catch (addError) {
      notify('error', errorMessage(addError, 'Không thêm được người chơi.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Đăng ký' }} />
      <ScrollView contentContainerStyle={{ paddingVertical: 12, paddingBottom: 110, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}>
        <Card style={{ gap: 4 }}>
          <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.ink }}>{session.title}</Text>
          <Text style={{ fontSize: font.small, color: colors.muted }}>{formatWeekdayDate(session.startsAtUtc)} · {formatTime(session.startsAtUtc)}–{formatTime(session.endsAtUtc)} · {session.venueName}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            <Chip label={`${roster.registeredCount}/${roster.capacity} đã đăng ký`} icon="account-check-outline" bg={colors.brandSoft} fg={colors.brand} />
            {roster.waitlistedCount > 0 && <Chip label={`${roster.waitlistedCount} đang chờ`} icon="clock-outline" bg={colors.warnSoft} fg={colors.warn} />}
            <Chip label={`Hạn ${formatWeekdayDate(roster.registrationDeadlineUtc)} ${formatTime(roster.registrationDeadlineUtc)}`} bg={colors.neutralSoft} fg={colors.neutral} />
          </View>
        </Card>
        {!roster.isAcceptingRegistrations && <Banner tone="warn" icon="lock-outline" text="Lịch đánh không còn nhận đăng ký (đã qua hạn, đã bắt đầu, đang nháp hoặc đã hủy)." />}

        <SectionTitle>Đã đăng ký ({roster.registered.length})</SectionTitle>
        <Card style={{ paddingVertical: 4 }}>
          {roster.registered.length === 0
            ? <EmptyState icon="account-multiple-outline" title="Chưa có ai đăng ký" />
            : roster.registered.map((row, index) => (
              <RegistrationRow key={row.id} row={row} last={index === roster.registered.length - 1} canRemove={canRemove} busy={busy === row.playerId} disabled={busy !== null} onRemove={() => remove(row)} />
            ))}
        </Card>

        {roster.waitlisted.length > 0 && (
          <>
            <SectionTitle>Danh sách chờ ({roster.waitlisted.length})</SectionTitle>
            <Text style={{ fontSize: font.caption, color: colors.muted, marginHorizontal: 16, marginTop: -4 }}>Khi có người rời, người đứng đầu được lên tự động.</Text>
            <Card style={{ paddingVertical: 4 }}>
              {roster.waitlisted.map((row, index) => (
                <RegistrationRow key={row.id} row={row} order={index + 1} last={index === roster.waitlisted.length - 1} canRemove={canRemove} busy={busy === row.playerId} disabled={busy !== null} onRemove={() => remove(row)} />
              ))}
            </Card>
          </>
        )}
      </ScrollView>

      {roster.isAcceptingRegistrations && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Button label="Thêm người chơi" icon="account-plus-outline" onPress={() => setPickerOpen(true)} disabled={busy !== null} style={{ flex: 1 }} />
        </View>
      )}

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <AddPlayerSheet excluded={inRoster} busyId={busy} full={roster.remainingSlots <= 0} onAdd={(option) => void add(option)} onClose={() => setPickerOpen(false)} />
      </Modal>
    </View>
  )
}

function RegistrationRow({ row, order, last, canRemove, busy, disabled, onRemove }: { row: RegistrationView; order?: number; last: boolean; canRemove: boolean; busy: boolean; disabled: boolean; onRemove: () => void }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      {order !== undefined && <Text style={styles.order}>{order}</Text>}
      <Avatar name={row.playerName} seed={row.playerId} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.body, color: colors.ink }} numberOfLines={1}>{row.playerName}</Text>
        {row.status === 'promoted' && <Text style={{ fontSize: font.caption, color: colors.ok }}>Được lên từ danh sách chờ</Text>}
      </View>
      {canRemove && (
        <Pressable accessibilityLabel={`Gỡ ${row.playerName}`} disabled={disabled} onPress={onRemove} style={[styles.removeButton, disabled && !busy && { opacity: 0.4 }]}>
          {busy ? <ActivityIndicator size="small" color={colors.danger} /> : <Icon name="account-remove-outline" color={colors.danger} />}
        </Pressable>
      )}
    </View>
  )
}

function AddPlayerSheet({ excluded, busyId, full, onAdd, onClose }: { excluded: Set<string>; busyId: string | null; full: boolean; onAdd: (option: RegistrationPlayerOption) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  const [searchInput, setSearchInput] = useState('')
  const [state, setState] = useState<{ search: string; items: RegistrationPlayerOption[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  // Tìm sau khi ngừng gõ một chút; server trả tối đa 100 người chơi đang hoạt động.
  useEffect(() => {
    let current = true
    const search = searchInput.trim()
    const timer = setTimeout(() => {
      setError(null)
      getRegistrationPlayers(search)
        .then((items) => { if (current) setState({ search, items }) })
        .catch((loadError: unknown) => { if (current) setError(errorMessage(loadError, 'Không tải được người chơi.')) })
    }, 300)
    return () => { current = false; clearTimeout(timer) }
  }, [searchInput, attempt])

  const items = (state?.items ?? []).filter((option) => !excluded.has(option.id))
  const searching = !error && (state === null || state.search !== searchInput.trim())
  return (
    <View style={styles.sheetBackdrop}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ flex: 1, fontSize: font.body, fontWeight: '700', color: colors.ink }}>Thêm người chơi</Text>
          <Pressable accessibilityLabel="Đóng" onPress={onClose} hitSlop={12}><Icon name="close" /></Pressable>
        </View>
        {full && <Text style={{ fontSize: font.caption, color: colors.warn, marginBottom: 8 }}>Lịch đã đủ chỗ: người được thêm sẽ vào danh sách chờ.</Text>}
        <View style={styles.searchBox}>
          <Icon name="magnify" color={colors.muted} />
          <TextInput value={searchInput} onChangeText={setSearchInput} placeholder="Tìm tên hoặc mã người chơi" placeholderTextColor={colors.muted} style={styles.searchInput} autoFocus maxLength={100} />
          {searching && <ActivityIndicator size="small" color={colors.brand} />}
        </View>
        {error ? <ErrorState message={error} onRetry={() => setAttempt((value) => value + 1)} />
          : state === null ? <Loading />
            : (
              <FlatList
                data={items}
                keyExtractor={(option) => option.id}
                keyboardShouldPersistTaps="handled"
                style={{ marginTop: 8 }}
                ListEmptyComponent={<EmptyState icon="account-search-outline" title="Không có người chơi phù hợp" message="Chỉ người chơi đang hoạt động và chưa có trong danh sách mới hiện ở đây." />}
                renderItem={({ item }) => (
                  <Pressable disabled={busyId !== null} onPress={() => onAdd(item)} style={({ pressed }) => [styles.pickRow, { opacity: pressed || (busyId !== null && busyId !== item.id) ? 0.6 : 1 }]}>
                    <Avatar name={item.displayName} seed={item.id} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: font.body, color: colors.ink }} numberOfLines={1}>{item.displayName}</Text>
                      {item.email ? <Text style={{ fontSize: font.caption, color: colors.muted }} numberOfLines={1}>{item.email}</Text> : null}
                    </View>
                    {busyId === item.id ? <ActivityIndicator size="small" color={colors.brand} /> : <Icon name="plus-circle-outline" color={colors.brand} />}
                  </Pressable>
                )}
              />
            )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  order: { width: 24, textAlign: 'center', fontSize: font.body, fontWeight: '700', color: colors.warn },
  removeButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSoft },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, height: '80%' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, minHeight: 44, fontSize: font.body, color: colors.ink },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12 },
})
