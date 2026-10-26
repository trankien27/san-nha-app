import { useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { errorMessage } from '@/lib/api'
import { getActivePlayers, getAttendance, getRoster, getSession, saveAttendance } from '@/lib/endpoints'
import { skillLabel } from '@/lib/format'
import type { AttendanceInput } from '@/lib/types'
import { useLoad } from '@/lib/useLoad'
import { Avatar, Banner, Button, Chip, ErrorState, Icon, Loading } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

interface Row { key: string; playerId: string | null; name: string; sub: string; registered: boolean }
const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim()

/** Chọn người có mặt (thành viên và khách) cho buổi; lưu cả danh sách một lần như trang web. */
export default function AttendanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const notify = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [guests, setGuests] = useState<{ name: string; skillRating: number | null }[]>([])
  const [search, setSearch] = useState('')
  const [guestName, setGuestName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const { data, error, loading, reload } = useLoad(async () => {
    const [session, players, attendance, roster] = await Promise.all([getSession(id), getActivePlayers(), getAttendance(id), getRoster(id)])
    const present = attendance.filter((row) => row.status === 'present' || row.status === 'guest')
    setSelected(new Set(present.flatMap((row) => (row.playerId ? [row.playerId] : []))))
    setGuests(present.filter((row) => !row.playerId).map((row) => ({ name: row.name, skillRating: row.skillRating })))
    setDirty(false)
    const registeredIds = new Set([...roster.registered].map((row) => row.playerId))
    const rows: Row[] = players.map((player) => ({ key: player.id, playerId: player.id, name: player.fullName, sub: `${player.memberCode} · ${skillLabel(player.effectiveSkillRating)}`, registered: registeredIds.has(player.id) }))
    // Người đã có mặt nhưng hồ sơ không còn hoạt động vẫn hiện để không bị gỡ nhầm.
    present.filter((row) => row.playerId && !players.some((player) => player.id === row.playerId))
      .forEach((row) => rows.push({ key: row.playerId!, playerId: row.playerId, name: row.name, sub: 'Hồ sơ ngừng hoạt động', registered: false }))
    rows.sort((a, b) => Number(b.registered) - Number(a.registered) || a.name.localeCompare(b.name, 'vi'))
    return { session, rows }
  }, id)

  const readOnly = data?.session.status === 'costClosed' || data?.session.status === 'cancelled'
  const visible = useMemo(() => {
    const term = normalize(search)
    return (data?.rows ?? []).filter((row) => !term || normalize(`${row.name} ${row.sub}`).includes(term))
  }, [data, search])

  if (loading) return <Loading />
  if (error || !data) return <ErrorState message={error ?? 'Không tải được danh sách.'} onRetry={() => void reload()} />

  const toggle = (playerId: string) => {
    if (readOnly) return
    setSelected((current) => { const next = new Set(current); if (next.has(playerId)) next.delete(playerId); else next.add(playerId); return next })
    setDirty(true)
  }
  const addGuest = () => {
    const name = guestName.trim().replace(/\s+/g, ' ')
    if (name.length < 2) { setFormError('Tên khách cần ít nhất 2 ký tự.'); return }
    if (guests.some((guest) => normalize(guest.name) === normalize(name))) { setFormError(`Đã có khách tên "${name}".`); return }
    setGuests((current) => [...current, { name, skillRating: null }])
    setGuestName(''); setFormError(null); setDirty(true)
  }
  const save = async () => {
    setSaving(true)
    try {
      const input: AttendanceInput[] = [
        ...[...selected].map((playerId) => ({ playerId, guestName: null, status: 'present' as const, isChargeable: true })),
        ...guests.map((guest) => ({ playerId: null, guestName: guest.name, status: 'guest' as const, isChargeable: true, skillRating: guest.skillRating })),
      ]
      const saved = await saveAttendance(id, input)
      setDirty(false)
      notify('success', `Đã lưu ${saved.filter((row) => row.status === 'present' || row.status === 'guest').length} người có mặt.`)
    } catch (saveError) {
      notify('error', errorMessage(saveError, 'Không lưu được điểm danh.'))
    } finally {
      setSaving(false)
    }
  }
  const total = selected.size + guests.length

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={visible}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 110 }}
        ListHeaderComponent={
          <View style={{ gap: 10, paddingTop: 12, paddingBottom: 6 }}>
            {readOnly && <Banner tone="warn" icon="lock-outline" text={data.session.status === 'cancelled' ? 'Buổi đã hủy, không sửa được điểm danh.' : 'Tiền buổi đã chốt nên danh sách đã khóa. Mở lại tiền buổi trên web nếu cần sửa.'} />}
            <View style={styles.searchBox}>
              <Icon name="magnify" color={colors.muted} />
              <TextInput value={search} onChangeText={setSearch} placeholder="Tìm tên hoặc mã người chơi" placeholderTextColor={colors.muted} style={styles.searchInput} />
            </View>
            {(guests.length > 0 || !readOnly) && (
              <View style={styles.guestCard}>
                <Text style={{ fontSize: font.small, fontWeight: '600', color: colors.ink }}>Khách vãng lai ({guests.length})</Text>
                {guests.map((guest) => (
                  <View key={guest.name} style={styles.guestRow}>
                    <Avatar name={guest.name} size={30} />
                    <Text style={{ flex: 1, fontSize: font.body, color: colors.ink }}>{guest.name}</Text>
                    {!readOnly && <Pressable accessibilityLabel={`Bỏ khách ${guest.name}`} onPress={() => { setGuests((current) => current.filter((row) => row.name !== guest.name)); setDirty(true) }} hitSlop={10}><Icon name="close-circle-outline" color={colors.muted} /></Pressable>}
                  </View>
                ))}
                {!readOnly && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput value={guestName} onChangeText={(value) => { setGuestName(value); setFormError(null) }} placeholder="Tên khách" placeholderTextColor={colors.muted} style={[styles.searchInput, styles.guestInput]} onSubmitEditing={addGuest} />
                    <Button label="Thêm" tone="outline" icon="account-plus-outline" onPress={addGuest} />
                  </View>
                )}
                {formError && <Text style={{ color: colors.danger, fontSize: font.small }}>{formError}</Text>}
              </View>
            )}
            <Text style={{ fontSize: font.small, color: colors.muted, marginHorizontal: 16 }}>Người đăng ký buổi này hiện trước.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const on = item.playerId ? selected.has(item.playerId) : false
          return (
            <Pressable onPress={() => item.playerId && toggle(item.playerId)} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.85 : 1 }]}>
              <Avatar name={item.name} seed={item.playerId ?? item.name} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.body, color: colors.ink }}>{item.name}</Text>
                <Text style={{ fontSize: font.caption, color: colors.muted }}>{item.sub}{item.registered ? ' · đã đăng ký' : ''}</Text>
              </View>
              {on ? <Chip label="Có mặt" icon="check" bg={colors.brandSoft} fg={colors.brand} style={{ paddingVertical: 6 }} />
                : <Chip label="Chưa có mặt" bg="#fff" fg={colors.muted} style={{ paddingVertical: 6, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed' }} />}
            </Pressable>
          )
        }}
      />
      {!readOnly && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={{ flex: 1, fontSize: font.small, color: colors.ink }}><Text style={{ fontWeight: '700' }}>{total}</Text> người có mặt{dirty ? ' · chưa lưu' : ''}</Text>
          <Button label="Lưu điểm danh" busy={saving} disabled={!dirty} onPress={() => void save()} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, marginHorizontal: 16 },
  searchInput: { flex: 1, minHeight: 44, fontSize: font.body, color: colors.ink },
  guestCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginHorizontal: 16, gap: 10 },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  guestInput: { backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
})
