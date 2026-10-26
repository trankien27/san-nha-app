import { Stack } from 'expo-router'
import { useState } from 'react'
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { usePermissions } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { formatDate, formatTime, formatVnd } from '@/lib/format'
import { currentMonth, formatIsoDate, getPaymentOverview, monthLabel, reversePayment, shiftMonth, type FinancePayment } from '@/lib/services/finance'
import { useLoad } from '@/lib/useLoad'
import { Avatar, Button, Chip, EmptyState, ErrorState, Icon, Loading, styles as ui } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

/** Các khoản đã thu: tìm, lọc tháng; đảo khoản ghi nhầm (bắt buộc lý do) để hoàn lại công nợ liên quan, bản ghi cũ vẫn giữ trong lịch sử. */
export default function PaymentsScreen() {
  const { canBill } = usePermissions()
  const notify = useToast()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('')
  const [page, setPage] = useState(1)
  const [reversing, setReversing] = useState<FinancePayment | null>(null)
  const [busy, setBusy] = useState(false)
  const { data, error, loading, refreshing, reload } = useLoad(() => (canBill ? getPaymentOverview(page, search, period) : Promise.resolve(null)), `${page}|${search}|${period}`)

  const header = <Stack.Screen options={{ title: 'Đã thu' }} />
  if (!canBill) return <>{header}<EmptyState icon="lock-outline" title="Không có quyền xem tiền đã thu" message="Chỉ Quản trị và Kế toán mới xem được phần tiền." /></>

  const applySearch = () => { setSearch(searchInput.trim()); setPage(1) }
  const changePeriod = (value: string) => { setPeriod(value); setPage(1) }
  const rows = data?.payments.items ?? []
  const pages = data?.payments.totalPages ?? 1
  // Khoản đã có giao dịch đảo trong trang hiện tại thì không đảo lần nữa (server cũng chặn).
  const reversed = new Set(rows.map((row) => row.reversalOfPaymentId).filter(Boolean))
  const pageTotal = rows.filter((row) => row.status === 'posted').reduce((sum, row) => sum + row.amount, 0)

  const reverse = async (payment: FinancePayment, reason: string) => {
    setBusy(true)
    try {
      await reversePayment(payment.id, reason)
      setReversing(null)
      notify('success', 'Đã đảo khoản thu và hoàn lại công nợ liên quan.')
      await reload()
    } catch (reverseError) {
      notify('error', errorMessage(reverseError, 'Không thể đảo khoản thu.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {header}
      <FlatList
        data={loading || error ? [] : rows}
        keyExtractor={(row) => row.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}
        ListHeaderComponent={
          <View style={{ gap: 12, paddingTop: 12, paddingBottom: 8 }}>
            <View style={styles.searchBox}>
              <Icon name="magnify" color={colors.muted} />
              <TextInput value={searchInput} onChangeText={setSearchInput} onSubmitEditing={applySearch} returnKeyType="search" placeholder="Tên hoặc mã người chơi" placeholderTextColor={colors.muted} style={styles.searchInput} />
              {searchInput !== '' && <Pressable accessibilityLabel="Xóa tìm kiếm" hitSlop={10} onPress={() => { setSearchInput(''); setSearch(''); setPage(1) }}><Icon name="close-circle" color={colors.muted} size={18} /></Pressable>}
              <Pressable accessibilityRole="button" onPress={applySearch} style={styles.searchButton}><Text style={{ color: '#fff', fontWeight: '600', fontSize: font.small }}>Tìm</Text></Pressable>
            </View>
            <MonthFilter value={period} onChange={changePeriod} />
            {data && <Text style={styles.count}>{data.payments.totalItems} khoản{rows.length > 0 ? ` · trang này ${formatVnd(pageTotal)}` : ''}</Text>}
          </View>
        }
        ListEmptyComponent={loading ? <Loading /> : error ? <ErrorState message={error} onRetry={() => void reload()} />
          : <EmptyState icon="cash-remove" title="Chưa thu khoản nào" message={search || period ? 'Không có khoản thu khớp bộ lọc.' : 'Khoản đã thu xuất hiện khi bạn ghi người chơi đã trả.'} />}
        renderItem={({ item }) => {
          const isReversal = item.reversalOfPaymentId !== null
          const canReverse = item.status === 'posted' && !isReversal && !reversed.has(item.id)
          const status = item.status === 'reversed' ? { label: 'Đã bị đảo', bg: colors.neutralSoft, fg: colors.neutral }
            : isReversal ? { label: 'Giao dịch đảo', bg: colors.warnSoft, fg: colors.warn } : { label: 'Đã ghi sổ', bg: colors.okSoft, fg: colors.ok }
          return (
            <View style={styles.rowCard}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Avatar name={item.playerName} seed={item.playerId} />
                <View style={{ flex: 1 }}>
                  <Text style={ui.rowTitle}>{item.playerName}</Text>
                  <Text style={ui.rowSub}>{formatIsoDate(item.paymentDate)} · {item.method}{item.referenceCode ? ` · ${item.referenceCode}` : ''}</Text>
                  <Text style={ui.rowSub}>Ghi lúc {formatTime(item.createdAtUtc)} {formatDate(item.createdAtUtc)}</Text>
                </View>
                <Text style={{ fontSize: font.body, fontWeight: '700', color: item.amount >= 0 ? colors.ok : colors.danger, textDecorationLine: item.status === 'reversed' ? 'line-through' : 'none' }}>{formatVnd(item.amount)}</Text>
              </View>
              <View style={styles.allocations}>
                {item.allocations.length
                  ? item.allocations.map((allocation) => <Text key={allocation.receivableId} style={ui.rowSub}>• {allocation.description}: {formatVnd(allocation.amount)}</Text>)
                  : <Text style={ui.rowSub}>Chưa phân bổ (ghi vào số dư trả trước)</Text>}
                {item.notes && <Text style={ui.rowSub}>Ghi chú: {item.notes}</Text>}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <Chip label={status.label} bg={status.bg} fg={status.fg} />
                {canReverse && <Button label="Đảo" tone="danger" icon="undo-variant" disabled={busy} onPress={() => setReversing(item)} style={{ paddingHorizontal: 14 }} />}
              </View>
            </View>
          )
        }}
        ListFooterComponent={!loading && !error && pages > 1 ? (
          <View style={styles.pager}>
            <Button label="Trước" tone="outline" icon="chevron-left" disabled={page <= 1} onPress={() => setPage(page - 1)} />
            <Text style={{ fontSize: font.small, color: colors.muted }}>Trang {page}/{pages}</Text>
            <Button label="Sau" tone="outline" icon="chevron-right" disabled={page >= pages} onPress={() => setPage(page + 1)} />
          </View>
        ) : undefined}
      />
      {reversing && (
        <ReasonModal
          title={`Đảo khoản thu ${formatVnd(reversing.amount)}`}
          message={`${reversing.playerName} · ${formatIsoDate(reversing.paymentDate)}. Công nợ đã phân bổ sẽ được hoàn lại; khoản thu cũ vẫn giữ trong lịch sử.`}
          busy={busy}
          onCancel={() => setReversing(null)}
          onConfirm={(reason) => void reverse(reversing, reason)}
        />
      )}
    </>
  )
}

function MonthFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.chipRow}>
      <Pressable accessibilityRole="radio" accessibilityState={{ checked: !value }} onPress={() => onChange('')}>
        <Chip label="Mọi tháng" bg={!value ? colors.money : '#fff'} fg={!value ? '#fff' : colors.ink} style={[styles.toggleChip, { borderColor: !value ? colors.money : colors.line }]} />
      </Pressable>
      {value ? (
        <View style={styles.monthStepper}>
          <Pressable accessibilityLabel="Tháng trước" onPress={() => onChange(shiftMonth(value, -1))} style={styles.monthButton}><Icon name="chevron-left" color={colors.money} /></Pressable>
          <Text style={{ fontSize: font.small, fontWeight: '600', color: colors.money, minWidth: 96, textAlign: 'center' }}>{monthLabel(value)}</Text>
          <Pressable accessibilityLabel="Tháng sau" onPress={() => onChange(shiftMonth(value, 1))} style={styles.monthButton}><Icon name="chevron-right" color={colors.money} /></Pressable>
        </View>
      ) : (
        <Pressable accessibilityRole="radio" accessibilityState={{ checked: false }} onPress={() => onChange(currentMonth())}>
          <Chip label="Lọc theo tháng" icon="calendar-month-outline" bg="#fff" fg={colors.ink} style={[styles.toggleChip, { borderColor: colors.line }]} />
        </Pressable>
      )}
    </View>
  )
}

/** Hộp nhập lý do (tối thiểu 3 ký tự), dùng thay Alert.prompt vì Alert.prompt chỉ có trên iOS. */
function ReasonModal({ title, message, busy, onCancel, onConfirm }: { title: string; message: string; busy: boolean; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    if (reason.trim().length < 3) { setError('Lý do cần ít nhất 3 ký tự.'); return }
    onConfirm(reason.trim())
  }
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onCancel() }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.modalCard}>
          <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.ink }}>{title}</Text>
          <Text style={{ fontSize: font.small, color: colors.muted }}>{message}</Text>
          <TextInput value={reason} onChangeText={(text) => { setReason(text); setError(null) }} autoFocus multiline maxLength={500} editable={!busy} placeholder="Lý do đảo (tối thiểu 3 ký tự)" placeholderTextColor={colors.muted} style={styles.reasonInput} />
          {error && <Text style={{ fontSize: font.small, color: colors.danger }}>{error}</Text>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Không" tone="outline" disabled={busy} onPress={onCancel} style={{ flex: 1 }} />
            <Button label="Đảo khoản thu" tone="money" busy={busy} onPress={submit} style={{ flex: 1 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingLeft: 12, paddingRight: 4, marginHorizontal: 16 },
  searchInput: { flex: 1, minHeight: 44, fontSize: font.body, color: colors.ink },
  searchButton: { backgroundColor: colors.money, borderRadius: 10, paddingHorizontal: 14, minHeight: 38, justifyContent: 'center' },
  chipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginHorizontal: 16 },
  toggleChip: { paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1 },
  monthStepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.moneySoft, borderRadius: 999, paddingHorizontal: 4 },
  monthButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: font.small, color: colors.muted, marginHorizontal: 16, marginTop: 4 },
  rowCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginHorizontal: 16, marginBottom: 10 },
  allocations: { marginTop: 8, marginLeft: 46, gap: 2 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12 },
  reasonInput: { minHeight: 80, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingTop: 10, fontSize: font.body, color: colors.ink, textAlignVertical: 'top' },
})
