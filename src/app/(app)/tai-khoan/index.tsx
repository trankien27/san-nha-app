import { Stack } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { formatTime, formatWeekdayDate } from '@/lib/format'
import { createUser, getUsers, resetUserPassword, updateUserLock, updateUserRoles, type UserAccount, type UserStatusFilter } from '@/lib/services/reports'
import type { AppRole } from '@/lib/types'
import { useLoad } from '@/lib/useLoad'
import { Avatar, Banner, Button, Chip, EmptyState, ErrorState, Icon, Loading, type IconName } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const roles: AppRole[] = ['ADMIN', 'ORGANIZER', 'TREASURER', 'PLAYER']
const roleLabels: Record<AppRole, string> = { ADMIN: 'Quản trị viên', ORGANIZER: 'Hỗ trợ', TREASURER: 'Kế toán', PLAYER: 'Người chơi' }
const roleDescriptions: Record<AppRole, string> = {
  ADMIN: 'Toàn quyền hệ thống và tài khoản',
  ORGANIZER: 'Người chơi, lịch đánh, chia trận và sân',
  TREASURER: 'Vật tư, chi phí, công nợ và thanh toán',
  PLAYER: 'Xem lịch và dữ liệu cá nhân',
}
const roleColors: Record<AppRole, [string, string]> = {
  ADMIN: [colors.liveSoft, colors.liveDark], ORGANIZER: [colors.brandSoft, colors.brand], TREASURER: [colors.moneySoft, colors.money], PLAYER: [colors.neutralSoft, colors.neutral],
}
const PAGE_SIZE = 10

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n${message}`)) onConfirm(); return }
  Alert.alert(title, message, [{ text: 'Không', style: 'cancel' }, { text: 'Đồng ý', style: 'destructive', onPress: onConfirm }])
}

/** Quản lý tài khoản đăng nhập (chỉ Quản trị): tạo, phân vai trò, khóa/mở khóa và cấp lại mật khẩu tạm. */
export default function UsersScreen() {
  const isAdmin = useAuth().user?.roles.includes('ADMIN') ?? false
  return (
    <>
      <Stack.Screen options={{ title: 'Tài khoản' }} />
      {isAdmin ? <Users /> : <EmptyState icon="lock-outline" title="Bạn không có quyền quản lý tài khoản" message="Chỉ Quản trị viên dùng được mục này." />}
    </>
  )
}

function Users() {
  const currentUserId = useAuth().user?.id
  const notify = useToast()
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<AppRole | ''>('')
  const [status, setStatus] = useState<UserStatusFilter>('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingRoles, setEditingRoles] = useState<UserAccount | null>(null)
  const [temporary, setTemporary] = useState<{ name: string; password: string } | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)

  const { data, setData, error, loading, refreshing, reload } = useLoad(
    () => getUsers({ page, pageSize: PAGE_SIZE, search, role, status }),
    `${page}|${search}|${role}|${status}`,
  )

  const replaceUser = (updated: UserAccount) => {
    if (data) setData({ ...data, items: data.items.map((user) => user.id === updated.id ? updated : user) })
  }
  const applySearch = () => { setPage(1); setSearch(searchInput.trim()) }

  const toggleLock = (user: UserAccount) => {
    if (user.id === currentUserId) return
    const run = async () => {
      setActionId(user.id)
      try {
        replaceUser(await updateUserLock(user.id, !user.isLocked))
        notify('success', user.isLocked ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.')
      } catch (lockError) {
        notify('error', errorMessage(lockError, 'Không thể thay đổi trạng thái tài khoản.'))
      } finally {
        setActionId(null)
      }
    }
    if (user.isLocked) void run()
    else confirmAction('Khóa tài khoản', `Khóa tài khoản của ${user.displayName}? Họ sẽ không đăng nhập được cho tới khi mở khóa.`, () => void run())
  }

  const resetPassword = (user: UserAccount) => {
    confirmAction('Đặt lại mật khẩu', `Đặt lại mật khẩu của ${user.displayName}? Phiên đăng nhập hiện tại của họ sẽ hết hiệu lực.`, () => void (async () => {
      setActionId(user.id)
      try {
        const response = await resetUserPassword(user.id)
        setTemporary({ name: user.displayName, password: response.temporaryPassword })
        replaceUser({ ...user, mustChangePassword: true })
        notify('success', 'Đã tạo mật khẩu tạm mới.')
      } catch (resetError) {
        notify('error', errorMessage(resetError, 'Không thể đặt lại mật khẩu.'))
      } finally {
        setActionId(null)
      }
    })())
  }

  const saveRoles = async (user: UserAccount, selected: AppRole[]) => {
    setActionId(user.id)
    try {
      replaceUser(await updateUserRoles(user.id, selected))
      setEditingRoles(null)
      notify('success', 'Đã cập nhật vai trò tài khoản.')
    } catch (rolesError) {
      notify('error', errorMessage(rolesError, 'Không thể cập nhật vai trò.'))
    } finally {
      setActionId(null)
    }
  }

  const header = (
    <View style={{ gap: 10, paddingTop: 12, paddingBottom: 8 }}>
      <View style={styles.searchBox}>
        <Icon name="magnify" color={colors.muted} />
        <TextInput value={searchInput} onChangeText={setSearchInput} onSubmitEditing={applySearch} returnKeyType="search" placeholder="Tìm theo tên hoặc email…" placeholderTextColor={colors.muted} autoCapitalize="none" style={styles.searchInput} />
        <Pressable accessibilityRole="button" onPress={applySearch} style={styles.searchButton}><Text style={{ color: colors.brand, fontWeight: '600', fontSize: font.small }}>Tìm</Text></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Toggle label="Tất cả vai trò" active={!role} onPress={() => { setPage(1); setRole('') }} />
        {roles.map((item) => <Toggle key={item} label={roleLabels[item]} active={role === item} onPress={() => { setPage(1); setRole(item) }} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {([['', 'Tất cả trạng thái'], ['active', 'Đang hoạt động'], ['locked', 'Đã khóa']] as [UserStatusFilter, string][]).map(([value, label]) => (
          <Toggle key={value || 'all'} label={label} active={status === value} onPress={() => { setPage(1); setStatus(value) }} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16 }}>
        <Text style={{ flex: 1, fontSize: font.small, color: colors.muted }}>{data ? `${data.totalItems} tài khoản` : 'Đang đồng bộ dữ liệu'}</Text>
        <Button label="Tạo tài khoản" icon="account-plus-outline" onPress={() => setShowCreate(true)} />
      </View>
    </View>
  )

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(user) => user.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor={colors.brand} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? <Loading label="Đang tải tài khoản…" />
            : error ? <ErrorState message={error} onRetry={() => void reload()} />
              : <EmptyState icon="account-search-outline" title="Không tìm thấy tài khoản" message="Hãy thay đổi từ khóa hoặc bộ lọc." />
        }
        renderItem={({ item }) => (
          <UserCard user={item} isSelf={item.id === currentUserId} busy={actionId === item.id}
            onRoles={() => setEditingRoles(item)} onReset={() => resetPassword(item)} onLock={() => toggleLock(item)} />
        )}
        ListFooterComponent={data && data.totalPages > 1 ? (
          <View style={styles.pager}>
            <Button label="Trước" tone="outline" icon="chevron-left" disabled={page <= 1} onPress={() => setPage((value) => value - 1)} />
            <Text style={{ flex: 1, textAlign: 'center', fontSize: font.small, color: colors.muted }}>Trang {data.page}/{data.totalPages}</Text>
            <Button label="Sau" tone="outline" icon="chevron-right" disabled={page >= data.totalPages} onPress={() => setPage((value) => value + 1)} />
          </View>
        ) : undefined}
      />
      {showCreate && <CreateUserSheet onClose={() => setShowCreate(false)} onCreated={(user, password) => { setShowCreate(false); setTemporary({ name: user.displayName, password }); void reload() }} />}
      {editingRoles && <RolesSheet user={editingRoles} saving={actionId === editingRoles.id} onClose={() => setEditingRoles(null)} onSave={(selected) => void saveRoles(editingRoles, selected)} />}
      {temporary && <TemporaryPasswordSheet {...temporary} onClose={() => setTemporary(null)} />}
    </View>
  )
}

function UserCard({ user, isSelf, busy, onRoles, onReset, onLock }: { user: UserAccount; isSelf: boolean; busy: boolean; onRoles: () => void; onReset: () => void; onLock: () => void }) {
  const state = user.isLocked ? { label: 'Đã khóa', bg: colors.dangerSoft, fg: colors.danger }
    : user.mustChangePassword ? { label: 'Chờ đổi mật khẩu', bg: colors.warnSoft, fg: colors.warnDark }
      : { label: 'Hoạt động', bg: colors.okSoft, fg: colors.ok }
  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar name={user.displayName} seed={user.id} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.body, fontWeight: '600', color: colors.ink }} numberOfLines={1}>{user.displayName}{isSelf ? ' (Bạn)' : ''}</Text>
          <Text style={{ fontSize: font.caption, color: colors.muted }} numberOfLines={1}>{user.email}</Text>
        </View>
        <Chip label={state.label} bg={state.bg} fg={state.fg} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {user.roles.map((item) => <Chip key={item} label={roleLabels[item]} bg={roleColors[item][0]} fg={roleColors[item][1]} />)}
      </View>
      <Text style={{ fontSize: font.caption, color: colors.muted }}>
        Đăng nhập gần nhất: {user.lastLoginAtUtc ? `${formatWeekdayDate(user.lastLoginAtUtc)} ${formatTime(user.lastLoginAtUtc)}` : 'Chưa đăng nhập'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Action icon="account-cog-outline" label="Vai trò" onPress={onRoles} disabled={busy} />
        <Action icon="key-outline" label="Đặt lại MK" onPress={onReset} disabled={isSelf || busy} />
        <Action icon={user.isLocked ? 'lock-open-variant-outline' : 'lock-outline'} label={user.isLocked ? 'Mở khóa' : 'Khóa'} onPress={onLock} disabled={isSelf || busy} danger={!user.isLocked} />
      </View>
    </View>
  )
}

function Action({ icon, label, onPress, disabled, danger }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const fg = danger ? colors.danger : colors.brand
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled}
      style={({ pressed }) => [styles.action, { borderColor: danger ? '#F7C1C1' : colors.brandLight, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}>
      <Icon name={icon} size={17} color={fg} />
      <Text style={{ fontSize: font.small, color: fg, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}

function CreateUserSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (user: UserAccount, password: string) => void }) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [selected, setSelected] = useState<AppRole[]>(['PLAYER'])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (displayName.trim().length < 2 || !email.includes('@') || selected.length === 0) {
      setError('Vui lòng nhập tên, email hợp lệ và chọn ít nhất một vai trò.')
      return
    }
    setSaving(true); setError(null)
    try {
      const response = await createUser({ displayName: displayName.trim(), email: email.trim(), roles: selected })
      onCreated(response.user, response.temporaryPassword)
    } catch (createError) {
      setError(errorMessage(createError, 'Không thể tạo tài khoản.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet title="Tạo tài khoản mới" description="Mật khẩu tạm sẽ được tạo tự động và chỉ hiển thị một lần." onClose={onClose}>
      {error && <Banner tone="danger" icon="alert-circle-outline" text={error} />}
      <Field label="Họ và tên *"><TextInput value={displayName} onChangeText={(text) => { setDisplayName(text); setError(null) }} style={styles.input} autoFocus /></Field>
      <Field label="Email đăng nhập *"><TextInput value={email} onChangeText={(text) => { setEmail(text); setError(null) }} style={styles.input} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} /></Field>
      <Text style={styles.label}>Vai trò *</Text>
      <RolePicker selected={selected} onChange={(value) => { setSelected(value); setError(null) }} />
      <View style={styles.sheetActions}>
        <Button label="Hủy" tone="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button label="Tạo tài khoản" icon="account-plus-outline" busy={saving} onPress={() => void submit()} style={{ flex: 1 }} />
      </View>
    </Sheet>
  )
}

function RolesSheet({ user, saving, onClose, onSave }: { user: UserAccount; saving: boolean; onClose: () => void; onSave: (roles: AppRole[]) => void }) {
  const [selected, setSelected] = useState<AppRole[]>(user.roles)
  return (
    <Sheet title={`Vai trò của ${user.displayName}`} description="Một tài khoản có thể đảm nhiệm nhiều vai trò." onClose={onClose}>
      <RolePicker selected={selected} onChange={setSelected} />
      {selected.length === 0 && <Text style={{ fontSize: font.small, color: colors.danger }}>Chọn ít nhất một vai trò.</Text>}
      <View style={styles.sheetActions}>
        <Button label="Hủy" tone="outline" onPress={onClose} style={{ flex: 1 }} />
        <Button label="Lưu vai trò" icon="shield-check-outline" busy={saving} disabled={selected.length === 0} onPress={() => onSave(selected)} style={{ flex: 1 }} />
      </View>
    </Sheet>
  )
}

function TemporaryPasswordSheet({ name, password, onClose }: { name: string; password: string; onClose: () => void }) {
  const notify = useToast()
  // Chưa có thư viện clipboard: dùng hộp chia sẻ của hệ điều hành để sao chép hoặc gửi mật khẩu.
  const share = async () => {
    try { await Share.share({ message: password }) } catch { notify('error', 'Không mở được hộp chia sẻ. Hãy ghi lại mật khẩu thủ công.') }
  }
  return (
    <Sheet title="Mật khẩu tạm đã sẵn sàng" description={`Chỉ gửi mật khẩu này cho ${name} qua kênh an toàn.`} onClose={onClose}>
      <View style={styles.password}>
        <Text selectable style={{ flex: 1, fontSize: font.title, fontWeight: '700', color: colors.ink, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) }}>{password}</Text>
      </View>
      <Button label="Sao chép / chia sẻ" tone="outline" icon="share-variant-outline" onPress={() => void share()} />
      <Banner tone="warn" icon="key-outline" text="Mật khẩu không được lưu dạng rõ và chỉ hiện một lần. Người dùng bắt buộc đổi ngay sau lần đăng nhập đầu tiên." />
      <Button label="Tôi đã lưu mật khẩu" onPress={onClose} />
    </Sheet>
  )
}

function RolePicker({ selected, onChange }: { selected: AppRole[]; onChange: (roles: AppRole[]) => void }) {
  const toggle = (role: AppRole) => onChange(selected.includes(role) ? selected.filter((item) => item !== role) : [...selected, role])
  return (
    <View style={{ gap: 8 }}>
      {roles.map((role) => {
        const on = selected.includes(role)
        return (
          <Pressable key={role} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(role)}
            style={[styles.roleRow, { borderColor: on ? colors.brandMid : colors.line, backgroundColor: on ? colors.brandSoft : '#fff' }]}>
            <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={on ? colors.brand : colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.body, fontWeight: '600', color: colors.ink }}>{roleLabels[role]}</Text>
              <Text style={{ fontSize: font.caption, color: colors.muted }}>{roleDescriptions[role]}</Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

function Sheet({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.ink }}>{title}</Text>
              <Text style={{ fontSize: font.small, color: colors.muted, marginTop: 2 }}>{description}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose} style={styles.close}><Icon name="close" size={22} color={colors.muted} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingTop: 12 }}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <View style={{ gap: 6 }}><Text style={styles.label}>{label}</Text>{children}</View>
}

function Toggle({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
      style={[styles.toggle, { backgroundColor: active ? colors.brand : '#fff', borderColor: active ? colors.brand : colors.line }]}>
      <Text style={{ fontSize: font.small, color: active ? '#fff' : colors.ink, fontWeight: active ? '600' : '400' }}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingLeft: 12, marginHorizontal: 16 },
  searchInput: { flex: 1, minHeight: 44, fontSize: font.body, color: colors.ink },
  searchButton: { minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  chipRow: { gap: 8, paddingHorizontal: 16 },
  toggle: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 14, marginHorizontal: 16, marginBottom: 10, gap: 10 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, borderRadius: 12, borderWidth: 1, backgroundColor: '#fff', paddingHorizontal: 6 },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', padding: 16 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  label: { fontSize: font.small, color: colors.muted, fontWeight: '500' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, fontSize: font.body, color: colors.ink },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, padding: 12, borderRadius: 12, borderWidth: 1 },
  password: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 14 },
})
