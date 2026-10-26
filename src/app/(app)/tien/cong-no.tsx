import { Stack } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePermissions } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { formatDate, formatVnd, newIdempotencyKey } from '@/lib/format'
import {
  bangkokDate, currentMonth, digitsOnly, formatIsoDate, getOpenReceivables, getPaymentOverview, groupDigits, monthLabel, parseVnDate,
  receivableStatusLabels, recordPayment, shiftMonth, type FinanceReceivable,
} from '@/lib/services/finance'
import { useLoad } from '@/lib/useLoad'
import { Avatar, Button, Chip, EmptyState, ErrorState, Icon, Loading, styles as ui } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const quickMethods = ['Tiền mặt', 'Chuyển khoản'] as const
const formMethods = ['Chuyển khoản', 'Tiền mặt', 'Khác'] as const

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n${message}`)) onConfirm(); return }
  Alert.alert(title, message, [{ text: 'Không', style: 'cancel' }, { text: 'Đồng ý', onPress: onConfirm }])
}

/** Công nợ còn mở của người chơi (tạo khi chốt tiền lịch đánh): tìm, lọc tháng, ghi đã thu nhanh từng khoản hoặc ghi theo người chơi. */
export default function ReceivablesScreen() {
  const { canBill } = usePermissions()
  const notify = useToast()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('')
  const [page, setPage] = useState(1)
  const [method, setMethod] = useState<(typeof quickMethods)[number]>('Tiền mặt')
  const [busy, setBusy] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const { data, error, loading, refreshing, reload } = useLoad(() => (canBill ? getPaymentOverview(page, search, period) : Promise.resolve(null)), `${page}|${search}|${period}`)

  const header = <Stack.Screen options={{ title: 'Công nợ' }} />
  if (!canBill) return <>{header}<EmptyState icon="lock-outline" title="Không có quyền xem công nợ" message="Chỉ Quản trị và Kế toán mới xem được phần tiền." /></>

  const applySearch = () => { setSearch(searchInput.trim()); setPage(1) }
  const changePeriod = (value: string) => { setPeriod(value); setPage(1) }
  const money = (value: number | undefined) => (value === undefined ? '—' : formatVnd(value))
  const rows = data?.receivables.items ?? []
  const pages = data?.receivables.totalPages ?? 1

  const quickPay = (row: FinanceReceivable) => confirmAction('Ghi đã thu', `Ghi ${row.playerName} đã trả ${formatVnd(row.outstandingAmount)} (${method.toLowerCase()})?\n${row.description}`, async () => {
    setBusy(row.id)
    try {
      await recordPayment({ playerId: row.playerId, amount: row.outstandingAmount, paymentDate: bangkokDate(), method, referenceCode: null, idempotencyKey: newIdempotencyKey(`debt-${row.id}`), notes: `Trả nợ: ${row.description}`, receivableId: row.id })
      notify('success', `${row.playerName} đã trả ${formatVnd(row.outstandingAmount)}.`)
      await reload()
    } catch (payError) {
      notify('error', errorMessage(payError, 'Không thể ghi đã trả.'))
    } finally {
      setBusy(null)
    }
  })

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
            <View style={styles.summary}>
              <Text style={{ color: colors.moneyLight, fontSize: font.small }}>Còn nợ{period ? ` · ${monthLabel(period).toLowerCase()}` : ''}</Text>
              <Text style={{ color: '#fff', fontSize: font.big, fontWeight: '700' }}>{money(data?.outstanding)}</Text>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                <View style={{ flex: 1 }}><Text style={styles.summaryLabel}>Phát sinh</Text><Text style={styles.summaryValue}>{money(data?.charges)}</Text></View>
                <View style={{ flex: 1 }}><Text style={styles.summaryLabel}>Đã thu (phân bổ)</Text><Text style={styles.summaryValue}>{money(data?.allocated)}</Text></View>
              </View>
            </View>
            <View style={styles.searchBox}>
              <Icon name="magnify" color={colors.muted} />
              <TextInput value={searchInput} onChangeText={setSearchInput} onSubmitEditing={applySearch} returnKeyType="search" placeholder="Tên hoặc mã người chơi" placeholderTextColor={colors.muted} style={styles.searchInput} />
              {searchInput !== '' && <Pressable accessibilityLabel="Xóa tìm kiếm" hitSlop={10} onPress={() => { setSearchInput(''); setSearch(''); setPage(1) }}><Icon name="close-circle" color={colors.muted} size={18} /></Pressable>}
              <Pressable accessibilityRole="button" onPress={applySearch} style={styles.searchButton}><Text style={{ color: '#fff', fontWeight: '600', fontSize: font.small }}>Tìm</Text></Pressable>
            </View>
            <MonthFilter value={period} onChange={changePeriod} />
            <View style={styles.chipRow}>
              <Text style={{ fontSize: font.small, color: colors.muted }}>Ghi nhanh bằng</Text>
              {quickMethods.map((item) => (
                <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: method === item }} onPress={() => setMethod(item)}>
                  <Chip label={item} bg={method === item ? colors.money : '#fff'} fg={method === item ? '#fff' : colors.ink} style={[styles.toggleChip, { borderColor: method === item ? colors.money : colors.line }]} />
                </Pressable>
              ))}
            </View>
            <View style={{ paddingHorizontal: 16 }}>
              <Button label="Ghi đã thu theo người chơi" tone="money" icon="cash-plus" onPress={() => setShowForm(true)} />
            </View>
            {data && <Text style={styles.count}>{data.receivables.totalItems} khoản còn nợ</Text>}
          </View>
        }
        ListEmptyComponent={loading ? <Loading /> : error ? <ErrorState message={error} onRetry={() => void reload()} />
          : <EmptyState icon="check-circle-outline" title="Không có công nợ" message={search || period ? 'Không có khoản nợ khớp bộ lọc.' : 'Chốt tiền một lịch đánh để tạo công nợ cho từng người chơi.'} />}
        renderItem={({ item }) => (
          <View style={styles.rowCard}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Avatar name={item.playerName} seed={item.playerId} />
              <View style={{ flex: 1 }}>
                <Text style={ui.rowTitle}>{item.playerName}</Text>
                <Text style={ui.rowSub}>{item.description}</Text>
                <Text style={ui.rowSub}>Phải thu {formatVnd(item.amount)}{item.paidAmount > 0 ? ` · đã thu ${formatVnd(item.paidAmount)}` : ''} · ghi {formatDate(item.createdAtUtc)}</Text>
              </View>
              <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.danger }}>{formatVnd(item.outstandingAmount)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <Chip label={receivableStatusLabels[item.status]} bg={item.status === 'partiallyPaid' ? colors.warnSoft : colors.dangerSoft} fg={item.status === 'partiallyPaid' ? colors.warn : colors.danger} />
              <Button label="Ghi đã thu" tone="money" icon="cash-check" busy={busy === item.id} disabled={busy !== null || item.outstandingAmount <= 0} onPress={() => quickPay(item)} style={{ paddingHorizontal: 14 }} />
            </View>
          </View>
        )}
        ListFooterComponent={!loading && !error && pages > 1 ? <Pager page={page} pages={pages} onChange={setPage} /> : undefined}
      />
      {showForm && <PaymentForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void reload() }} />}
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

function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  return (
    <View style={styles.pager}>
      <Button label="Trước" tone="outline" icon="chevron-left" disabled={page <= 1} onPress={() => onChange(page - 1)} />
      <Text style={{ fontSize: font.small, color: colors.muted }}>Trang {page}/{pages}</Text>
      <Button label="Sau" tone="outline" icon="chevron-right" disabled={page >= pages} onPress={() => onChange(page + 1)} />
    </View>
  )
}

function MoneyInput({ value, onChange, style }: { value: string; onChange: (digits: string) => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.moneyBox, style]}>
      <TextInput value={value === '' ? '' : groupDigits(value)} onChangeText={(text) => onChange(digitsOnly(text))} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.moneyInput} />
      <Text style={{ color: colors.muted, fontSize: font.body }}>₫</Text>
    </View>
  )
}

interface Debtor { playerId: string; name: string; outstanding: number; count: number }
const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim()

/** Ghi đã thu cho một người chơi: số tiền tự phân bổ vào các khoản nợ cũ nhất trước (giống hộp "Ghi đã thu" trên web). */
function PaymentForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const insets = useSafeAreaInsets()
  const notify = useToast()
  const [debts, setDebts] = useState<FinanceReceivable[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [term, setTerm] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [amount, setAmount] = useState('')
  const [dateText, setDateText] = useState(formatIsoDate(bangkokDate()))
  const [method, setMethod] = useState<(typeof formMethods)[number]>('Chuyển khoản')
  const [referenceCode, setReferenceCode] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Cùng một khóa khi bấm lại sau lỗi mạng để server không ghi trùng; đổi nội dung thì tạo khóa mới.
  const keyRef = useRef<string | null>(null)
  const edit = (apply: () => void) => { apply(); keyRef.current = null; setError(null) }

  useEffect(() => {
    let alive = true
    getOpenReceivables()
      .then((rows) => { if (alive) { setDebts(rows); setLoadError(null) } })
      .catch((failure) => { if (alive) setLoadError(errorMessage(failure, 'Không thể tải danh sách công nợ.')) })
    return () => { alive = false }
  }, [attempt])

  const debtors = useMemo(() => {
    const map = new Map<string, Debtor>()
    for (const debt of debts ?? []) {
      const current = map.get(debt.playerId) ?? { playerId: debt.playerId, name: debt.playerName, outstanding: 0, count: 0 }
      current.outstanding += debt.outstandingAmount
      current.count += 1
      map.set(debt.playerId, current)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  }, [debts])
  const selected = debtors.find((debtor) => debtor.playerId === playerId)
  const visible = debtors.filter((debtor) => !term || normalize(debtor.name).includes(normalize(term)))
  const value = amount === '' ? 0 : Number(amount)

  const select = (debtor: Debtor) => edit(() => { setPlayerId(debtor.playerId); setAmount(String(debtor.outstanding)) })
  const submit = async () => {
    const paymentDate = parseVnDate(dateText)
    if (!selected || !Number.isSafeInteger(value) || value <= 0) { setError('Hãy chọn người đang có công nợ và nhập số tiền hợp lệ.'); return }
    if (!paymentDate) { setError('Ngày thanh toán phải có dạng ngày/tháng/năm, ví dụ 26/10/2026.'); return }
    if (paymentDate > bangkokDate()) { setError('Ngày thanh toán không được ở tương lai.'); return }
    keyRef.current ??= newIdempotencyKey(`pay-${selected.playerId}`)
    setSaving(true)
    setError(null)
    try {
      await recordPayment({ playerId: selected.playerId, amount: value, paymentDate, method, referenceCode: referenceCode.trim() || null, idempotencyKey: keyRef.current, notes: notes.trim() || null })
      keyRef.current = null
      notify('success', 'Đã ghi nhận và tự động phân bổ thanh toán.')
      onSaved()
    } catch (submitError) {
      setError(errorMessage(submitError, 'Không thể ghi thanh toán.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} onRequestClose={() => { if (!saving) onClose() }}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheetHeader, { paddingTop: Platform.OS === 'ios' ? 14 : insets.top + 10 }]}>
          <Text style={{ flex: 1, fontSize: font.title, fontWeight: '700', color: colors.ink }}>Ghi đã thu</Text>
          <Pressable accessibilityLabel="Đóng" disabled={saving} onPress={onClose} hitSlop={12} style={styles.closeButton}><Icon name="close" size={22} color={colors.ink} /></Pressable>
        </View>
        {loadError ? <ErrorState message={loadError} onRetry={() => { setLoadError(null); setAttempt((value) => value + 1) }} />
          : !debts ? <Loading label="Đang tải công nợ…" />
            : debtors.length === 0 ? <EmptyState icon="check-circle-outline" title="Không ai còn nợ" message="Chưa có công nợ nào để ghi đã thu." />
              : (
                <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
                  <Text style={styles.hint}>Số tiền được phân bổ vào các khoản nợ cũ nhất trước; phần dư ghi vào số dư trả trước của người chơi.</Text>
                  <Text style={styles.label}>Người chơi</Text>
                  {selected ? (
                    <View style={[styles.rowCard, styles.selectedDebtor]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Avatar name={selected.name} seed={selected.playerId} />
                        <View style={{ flex: 1 }}>
                          <Text style={ui.rowTitle}>{selected.name}</Text>
                          <Text style={ui.rowSub}>Còn nợ {formatVnd(selected.outstanding)} · {selected.count} khoản</Text>
                        </View>
                        <Button label="Đổi" tone="outline" disabled={saving} onPress={() => edit(() => setPlayerId(''))} />
                      </View>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      <View style={[styles.searchBox, { marginHorizontal: 0 }]}>
                        <Icon name="magnify" color={colors.muted} />
                        <TextInput value={term} onChangeText={setTerm} placeholder="Tìm người đang có công nợ" placeholderTextColor={colors.muted} style={styles.searchInput} />
                      </View>
                      <View style={{ backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14 }}>
                        {visible.length === 0 ? <Text style={[styles.hint, { paddingVertical: 14 }]}>Không tìm thấy người chơi.</Text> : visible.map((debtor, index) => (
                          <Pressable key={debtor.playerId} onPress={() => select(debtor)} style={({ pressed }) => [ui.row, { opacity: pressed ? 0.7 : 1, minHeight: 52 }, index === visible.length - 1 && { borderBottomWidth: 0 }]}>
                            <Avatar name={debtor.name} seed={debtor.playerId} size={30} />
                            <Text style={[ui.rowTitle, { flex: 1 }]}>{debtor.name}</Text>
                            <Text style={{ fontSize: font.small, color: colors.danger, fontWeight: '600' }}>{formatVnd(debtor.outstanding)}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}

                  <Text style={styles.label}>Số tiền (VNĐ)</Text>
                  <MoneyInput value={amount} onChange={(digits) => edit(() => setAmount(digits))} />
                  {selected && value > selected.outstanding && <Text style={styles.hint}>Nhiều hơn số nợ {formatVnd(value - selected.outstanding)}; phần dư ghi vào số dư trả trước.</Text>}

                  <Text style={styles.label}>Ngày thanh toán</Text>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TextInput value={dateText} onChangeText={(text) => edit(() => setDateText(text.replace(/[^\d/]/g, '')))} keyboardType="numbers-and-punctuation" placeholder="ngày/tháng/năm" placeholderTextColor={colors.muted} maxLength={10} style={[styles.input, { flex: 1 }]} />
                    {([['Hôm nay', 0], ['Hôm qua', -1]] as const).map(([label, days]) => {
                      const text = formatIsoDate(bangkokDate(days))
                      return (
                        <Pressable key={label} onPress={() => edit(() => setDateText(text))}>
                          <Chip label={label} bg={dateText === text ? colors.money : '#fff'} fg={dateText === text ? '#fff' : colors.ink} style={[styles.toggleChip, { borderColor: dateText === text ? colors.money : colors.line }]} />
                        </Pressable>
                      )
                    })}
                  </View>

                  <Text style={styles.label}>Phương thức</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {formMethods.map((item) => (
                      <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: method === item }} onPress={() => edit(() => setMethod(item))}>
                        <Chip label={item} bg={method === item ? colors.money : '#fff'} fg={method === item ? '#fff' : colors.ink} style={[styles.toggleChip, { borderColor: method === item ? colors.money : colors.line }]} />
                      </Pressable>
                    ))}
                  </View>

                  <TextInput value={referenceCode} onChangeText={(text) => edit(() => setReferenceCode(text))} maxLength={100} placeholder="Mã tham chiếu (không bắt buộc)" placeholderTextColor={colors.muted} style={styles.input} />
                  <TextInput value={notes} onChangeText={(text) => edit(() => setNotes(text))} maxLength={500} placeholder="Ghi chú (không bắt buộc)" placeholderTextColor={colors.muted} style={styles.input} />
                  {error && <Text style={{ color: colors.danger, fontSize: font.small }}>{error}</Text>}
                  <Button label={`Ghi thanh toán${value > 0 ? ` ${formatVnd(value)}` : ''}`} tone="money" icon="cash-check" busy={saving} disabled={!selected} onPress={() => void submit()} />
                </ScrollView>
              )}
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  summary: { backgroundColor: colors.money, borderRadius: 16, padding: 16, marginHorizontal: 16 },
  summaryLabel: { color: colors.moneyLight, fontSize: font.caption },
  summaryValue: { color: '#fff', fontSize: font.body, fontWeight: '600', marginTop: 2 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingLeft: 12, paddingRight: 4, marginHorizontal: 16 },
  searchInput: { flex: 1, minHeight: 44, fontSize: font.body, color: colors.ink },
  searchButton: { backgroundColor: colors.money, borderRadius: 10, paddingHorizontal: 14, minHeight: 38, justifyContent: 'center' },
  chipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginHorizontal: 16 },
  toggleChip: { paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1 },
  monthStepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.moneySoft, borderRadius: 999, paddingHorizontal: 4 },
  monthButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: font.small, color: colors.muted, marginHorizontal: 16, marginTop: 4 },
  rowCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginHorizontal: 16, marginBottom: 10 },
  selectedDebtor: { marginHorizontal: 0, marginBottom: 0, borderWidth: 1, borderColor: colors.moneyLight },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 6 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.line },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: font.small, fontWeight: '600', color: colors.ink },
  hint: { fontSize: font.caption, color: colors.muted },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', paddingHorizontal: 12, fontSize: font.body, color: colors.ink },
  moneyBox: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', paddingHorizontal: 12 },
  moneyInput: { flex: 1, minHeight: 46, fontSize: font.body, color: colors.ink },
})
