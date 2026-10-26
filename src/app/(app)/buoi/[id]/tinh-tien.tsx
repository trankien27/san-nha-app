import { router, Stack, useLocalSearchParams, type Href } from 'expo-router'
import { useRef, useState } from 'react'
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth, usePermissions } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { getAttendance, getSession } from '@/lib/endpoints'
import { formatDate, formatTime, formatVnd, formatWeekdayDate, newIdempotencyKey } from '@/lib/format'
import {
  cancelSessionCollection, closeSessionCost, collectionMethodLabels, digitsOnly, formatIsoDate, getAllInventoryItems, getBillingCost, groupDigits,
  perPersonText, recordSessionCollection, reopenSessionCost, saveSessionCost, setCourtActualCost, splitEven,
  type BillingCost, type InventoryItem, type SaveSessionCostInput, type SessionCollection, type SessionCollectionMethod,
} from '@/lib/services/finance'
import type { Attendance } from '@/lib/types'
import { useLoad } from '@/lib/useLoad'
import { Avatar, Banner, Button, Card, Chip, EmptyState, ErrorState, Loading, SectionTitle, styles as ui } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

// Đường dẫn của màn mới chưa có trong typed routes sinh tự động (.expo/types) cho tới lần chạy expo start kế tiếp.
const href = (path: string) => path as Href
/** Backend tự thêm người "Người chưa gán hồ sơ N" khi tổng số người lớn hơn số người trong danh sách. */
const EXTRA_PREFIX = 'Người chưa gán hồ sơ'

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n${message}`)) onConfirm(); return }
  Alert.alert(title, message, [{ text: 'Không', style: 'cancel' }, { text: 'Đồng ý', onPress: onConfirm }])
}

interface Draft {
  courtFee: string
  surchargeAll: string
  /** Phụ phí theo id dòng điểm danh. */
  surcharges: Record<string, number>
  /** Người miễn thu (theo id dòng điểm danh): vẫn chia đều cho họ nhưng không thu, không ghi công nợ. */
  exempt: Set<string>
  /** Số lượng vật tư dạng chữ để gõ được số thập phân. */
  quantities: Record<string, string>
  headCount: string
  dirty: boolean
}

const chargeFor = (cost: BillingCost, row: Attendance) =>
  cost.charges.find((charge) => (row.playerId ? charge.playerId === row.playerId : !charge.playerId && charge.name === row.name))

function buildDraft(cost: BillingCost, players: Attendance[]): Draft {
  const exempt = new Set(players.filter((row) => chargeFor(cost, row)?.isExempt).map((row) => row.id))
  const surcharges = Object.fromEntries(players.map((row) => [row.id, chargeFor(cost, row)?.surcharge ?? 0]))
  const distinct = [...new Set(players.filter((row) => !exempt.has(row.id)).map((row) => surcharges[row.id]))]
  const courtLine = cost.lines.filter((line) => line.category === 'court').reduce((sum, line) => sum + line.amount, 0)
  const extras = cost.charges.filter((charge) => !charge.playerId && charge.name.startsWith(EXTRA_PREFIX) && !players.some((row) => !row.playerId && row.name === charge.name)).length
  return {
    courtFee: String(cost.courtFee ?? courtLine),
    surchargeAll: distinct.length === 1 && distinct[0] > 0 ? String(distinct[0]) : '',
    surcharges,
    exempt,
    quantities: Object.fromEntries(cost.materials.map((material) => [material.inventoryItemId, String(material.quantity)])),
    headCount: String(players.length + extras),
    dirty: false,
  }
}

const parseQuantity = (text: string | undefined) => {
  const value = Number((text ?? '').replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? value : 0
}

/** 1234.5 → "1.234,5" (tối đa 3 chữ số thập phân như kho). */
function formatQuantity(value: number) {
  const [whole, fraction] = String(Math.round(value * 1000) / 1000).split('.')
  return `${groupDigits(whole)}${fraction ? `,${fraction}` : ''}`
}

type ReasonTarget = { kind: 'reopen' } | { kind: 'cancel'; collection: SessionCollection }

/** Tính tiền buổi (giống bảng tính tiền trên web): tiền sân + vật tư chia đều, phụ phí cộng riêng, miễn thu; lưu nháp, chốt và mở lại. */
export default function SessionBillingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const notify = useToast()
  const { canBill } = usePermissions()
  const isAdmin = useAuth().user?.roles.includes('ADMIN') ?? false
  const [draft, setDraft] = useState<Draft | null>(null)
  const [action, setAction] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [reasonFor, setReasonFor] = useState<ReasonTarget | null>(null)

  const { data, setData, error, loading, refreshing, reload } = useLoad(async () => {
    if (!canBill) return null
    const [session, cost, items, attendance] = await Promise.all([getSession(id), getBillingCost(id), getAllInventoryItems(), getAttendance(id)])
    const players = attendance.filter((row) => row.isChargeable && (row.status === 'present' || row.status === 'guest'))
    setDraft(buildDraft(cost, players))
    setFormError(null)
    const inventory = items.filter((item) => item.isActive || cost.materials.some((material) => material.inventoryItemId === item.id))
    return { session, cost, inventory, players }
  }, id)

  const header = <Stack.Screen options={{ title: 'Tính tiền' }} />
  if (!canBill) return <>{header}<EmptyState icon="lock-outline" title="Không có quyền tính tiền" message="Chỉ Quản trị và Kế toán mới tính tiền buổi." /></>
  if (loading) return <>{header}<Loading label="Đang tải dữ liệu tính tiền…" /></>
  if (error || !data || !draft) return <>{header}<ErrorState message={error ?? 'Không mở được bảng tính tiền.'} onRetry={() => void reload()} /></>

  const { session, cost, inventory, players } = data
  const cancelled = session.status === 'cancelled'
  const busy = action !== null

  const run = async (key: string, task: () => Promise<void>) => {
    setAction(key)
    setFormError(null)
    try {
      await task()
    } catch (taskError) {
      const message = errorMessage(taskError, 'Thao tác chưa thành công, vui lòng thử lại.')
      setFormError(message)
      notify('error', message)
    } finally {
      setAction(null)
    }
  }
  const updateCost = (next: BillingCost) => setData({ ...data, cost: next })

  const reopen = (reason: string) => run('reopen', async () => {
    await reopenSessionCost(id, reason)
    setReasonFor(null)
    notify('success', 'Đã mở lại tiền lịch đánh và hoàn vật tư vào kho.')
    await reload()
  })
  const cancelCollection = (collection: SessionCollection, reason: string) => run(`cancel-${collection.id}`, async () => {
    updateCost(await cancelSessionCollection(id, collection.id, reason))
    setReasonFor(null)
    notify('success', 'Đã hủy khoản thu.')
  })

  const reasonModal = reasonFor && (
    <ReasonModal
      title={reasonFor.kind === 'reopen' ? 'Mở lại tiền lịch đánh' : `Hủy khoản thu ${formatVnd(reasonFor.collection.amount)}`}
      message={reasonFor.kind === 'reopen' ? 'Công nợ của lần chốt này sẽ được đảo và vật tư hoàn vào kho. Nếu đã có người trả tiền, hãy bỏ đánh dấu đã trả trước.' : 'Khoản thu được giữ lại trong lịch sử với trạng thái đã hủy.'}
      confirmLabel={reasonFor.kind === 'reopen' ? 'Mở lại' : 'Hủy khoản thu'}
      busy={busy}
      onCancel={() => setReasonFor(null)}
      onConfirm={(reason) => void (reasonFor.kind === 'reopen' ? reopen(reason) : cancelCollection(reasonFor.collection, reason))}
    />
  )
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />
  const courtListed = cost.courtFee ?? cost.lines.filter((line) => line.category === 'court').reduce((sum, line) => sum + line.amount, 0)

  // ---------- Đã chốt ----------
  if (cost.isClosed) {
    const due = cost.totalAmount - (cost.exemptAmount ?? 0)
    const percent = due > 0 ? Math.min(100, Math.round((cost.collectedAmount / due) * 100)) : 100
    const exemptCharges = cost.charges.filter((charge) => charge.isExempt)
    return (
      <>
        {header}
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>
          <View style={styles.hero}>
            <Text style={styles.heroSub}>{session.title} · {formatWeekdayDate(session.startsAtUtc)}</Text>
            <Text style={styles.heroBig}>{formatVnd(cost.totalAmount)}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
              <Text style={{ color: colors.brandLight, fontSize: font.small }}>Đã thu {formatVnd(cost.collectedAmount)}</Text>
              <Text style={{ color: cost.collectedAmount >= due ? colors.brandLight : '#F5C4B3', fontSize: font.small }}>{cost.collectedAmount >= due ? 'Đã đủ' : `Còn ${formatVnd(due - cost.collectedAmount)}`}</Text>
            </View>
            <View style={styles.track}><View style={[styles.fill, { width: `${percent}%` }]} /></View>
            {cost.closedAtUtc && <Text style={[styles.heroSub, { fontSize: font.caption, marginTop: 6 }]}>Chốt lúc {formatTime(cost.closedAtUtc)} {formatDate(cost.closedAtUtc)}{exemptCharges.length > 0 ? ` · miễn thu ${exemptCharges.length} người (${formatVnd(cost.exemptAmount ?? 0)})` : ''}</Text>}
          </View>

          <View style={{ marginTop: 14, gap: 10 }}>
            <Banner tone="ok" icon="lock-check-outline" text="Đã chốt tiền. Công nợ đã ghi cho từng người chơi; ghi ai đã trả ở màn Tiền buổi." />
            <View style={{ paddingHorizontal: 16 }}>
              <Button label="Thu tiền từng người" tone="money" icon="account-cash-outline" onPress={() => (router.canGoBack() ? router.back() : router.replace(href(`/buoi/${id}/tien`)))} />
            </View>
          </View>

          <SectionTitle>Tiền sân</SectionTitle>
          <Card>
            <CourtActualField key={String(cost.courtActualCost ?? 'listed')} sessionId={id} saved={cost.courtActualCost ?? null} listed={courtListed} disabled={busy || cancelled} onSaved={updateCost} />
          </Card>

          <SectionTitle>Bảng tiền đã chốt</SectionTitle>
          <Card style={{ paddingVertical: 2 }}>
            {cost.lines.map((line) => (
              <View key={`${line.category}-${line.id}`} style={ui.row}>
                <Text style={[ui.rowTitle, { flex: 1 }]}>{line.description}</Text>
                <Text style={styles.amount}>{formatVnd(line.amount)}</Text>
              </View>
            ))}
            <View style={ui.row}>
              <Text style={[ui.rowTitle, { flex: 1, fontWeight: '600' }]}>Tổng tiền</Text>
              <Text style={[styles.amount, { fontWeight: '700', color: colors.money }]}>{formatVnd(cost.totalAmount)}</Text>
            </View>
            <View style={[ui.row, { borderBottomWidth: 0 }]}>
              <Text style={[ui.rowTitle, { flex: 1 }]}>{cost.charges.length} người</Text>
              <Text style={[styles.amount, { flexShrink: 1, textAlign: 'right' }]}>{perPersonText(cost.charges.map((charge) => charge.amount))}</Text>
            </View>
          </Card>

          <SectionTitle>Thu theo buổi (ghi tay)</SectionTitle>
          <CollectionPanel sessionId={id} cost={cost} disabled={busy || cancelled} onUpdated={updateCost} onCancel={(collection) => setReasonFor({ kind: 'cancel', collection })} />

          {formError && <Text style={[styles.errorText, { marginHorizontal: 16, marginTop: 12 }]}>{formError}</Text>}
          <View style={{ paddingHorizontal: 16, marginTop: 18 }}>
            {isAdmin
              ? <Button label="Mở lại bảng tiền" tone="danger" icon="lock-open-variant-outline" busy={action === 'reopen'} disabled={busy} onPress={() => setReasonFor({ kind: 'reopen' })} />
              : <Text style={styles.hint}>Chỉ Quản trị mới mở lại được bảng tiền đã chốt.</Text>}
          </View>
        </ScrollView>
        {reasonModal}
      </>
    )
  }

  // ---------- Bản nháp ----------
  const existing = Object.fromEntries(cost.materials.map((material) => [material.inventoryItemId, material.quantity]))
  const available = (item: InventoryItem) => item.stockOnHand + (existing[item.id] ?? 0)
  const fee = draft.courtFee === '' ? Number.NaN : Number(draft.courtFee)
  const feeValue = Number.isFinite(fee) ? fee : 0
  const materialAmount = inventory.reduce((sum, item) => sum + Math.round(parseQuantity(draft.quantities[item.id]) * item.effectiveSalePrice), 0)
  const surchargeOf = (player: Attendance) => (draft.exempt.has(player.id) ? 0 : draft.surcharges[player.id] ?? 0)
  const surchargeTotal = players.reduce((sum, player) => sum + surchargeOf(player), 0)
  const typedHead = draft.headCount === '' ? 0 : Number(draft.headCount)
  const head = Math.max(players.length, typedHead)
  const extras = head - players.length
  // Tiền sân + vật tư chia đều cho tổng số người; phụ phí cộng riêng vào phần của từng người (giống cách backend phân bổ).
  const baseTotal = feeValue + materialAmount
  const total = baseTotal + surchargeTotal
  const split = splitEven(baseTotal, head).map((amount, index) => amount + (index < players.length ? surchargeOf(players[index]) : 0))
  const exemptTotal = players.reduce((sum, player, index) => sum + (draft.exempt.has(player.id) ? split[index] ?? 0 : 0), 0)
  const exemptCount = players.filter((player) => draft.exempt.has(player.id)).length
  const extraShare = extras > 0 ? split[players.length] : 0

  const update = (patch: Partial<Draft>) => { setDraft({ ...draft, ...patch, dirty: true }); setFormError(null) }
  const toggleExempt = (rowId: string) => {
    const next = new Set(draft.exempt)
    if (next.has(rowId)) next.delete(rowId)
    else next.add(rowId)
    update({ exempt: next })
  }
  const applySurchargeToAll = (digits: string) => {
    const amount = digits === '' ? 0 : Number(digits)
    update({ surchargeAll: digits, surcharges: Object.fromEntries(players.map((player) => [player.id, amount])) })
  }
  const setQuantity = (itemId: string, text: string) => update({ quantities: { ...draft.quantities, [itemId]: text.replace(/[^\d.,]/g, '') } })

  const validate = () => {
    if (draft.courtFee === '' || !Number.isSafeInteger(fee) || fee < 0) return 'Tiền sân phải là số nguyên VNĐ, không âm.'
    if (draft.headCount !== '' && typedHead < players.length) return `Tổng số người không được nhỏ hơn số người trong danh sách (${players.length}).`
    if (head < 1) return 'Chọn người chơi (điểm danh) hoặc nhập tổng số người trước khi chia tiền.'
    if (head > 10000) return 'Tổng số người tối đa 10.000.'
    const invalid = inventory.find((item) => {
      const text = draft.quantities[item.id] ?? ''
      const quantity = Number(text.replace(',', '.'))
      if (text !== '' && !Number.isFinite(quantity)) return true
      const value = parseQuantity(text)
      return value > available(item) || Math.abs(Math.round(value * 1000) - value * 1000) > 1e-6
    })
    if (invalid) return `Số lượng ${invalid.name} vượt tồn kho hoặc có quá 3 chữ số thập phân.`
    return null
  }
  const buildInput = (): SaveSessionCostInput => ({
    allocationMethod: 'equal',
    lines: [],
    participants: players.map((player) => ({ playerId: player.playerId, guestName: player.playerId ? null : player.name, weight: 1, surcharge: Math.trunc(surchargeOf(player)), discount: 0, directAmount: 0, isWaived: false, isExempt: draft.exempt.has(player.id) })),
    materials: inventory.filter((item) => parseQuantity(draft.quantities[item.id]) > 0).map((item) => ({ inventoryItemId: item.id, quantity: parseQuantity(draft.quantities[item.id]) })),
    participantCount: head,
    courtFee: Math.trunc(feeValue),
  })
  const checked = () => {
    const problem = validate()
    if (problem) { setFormError(problem); notify('error', problem) }
    return problem === null
  }

  const save = () => {
    if (!checked()) return
    void run('save', async () => {
      const next = await saveSessionCost(id, buildInput())
      // Lưu vật tư trừ tồn kho ngay, nên tải lại kho để số "còn" đúng.
      const items = await getAllInventoryItems()
      setData({ ...data, cost: next, inventory: items.filter((item) => item.isActive || next.materials.some((material) => material.inventoryItemId === item.id)) })
      setDraft({ ...draft, dirty: false })
      notify('success', 'Đã lưu bảng tiền (chưa chốt).')
    })
  }
  const close = () => {
    if (!checked()) return
    const exemptNote = exemptCount ? `\nMiễn thu ${exemptCount} người (${formatVnd(exemptTotal)}), cần thu ${formatVnd(total - exemptTotal)}.` : ''
    confirmAction('Chốt tiền', `Chốt ${formatVnd(total)} chia cho ${head} người (${perPersonText(split)})?${exemptNote}\nSau khi chốt, công nợ được ghi cho từng người chơi.`, () => void run('close', async () => {
      try {
        await saveSessionCost(id, buildInput())
        const closed = await closeSessionCost(id)
        updateCost(closed)
        notify('success', exemptCount ? `Đã chốt tiền; công nợ đã ghi cho từng người chơi, miễn thu ${exemptCount} người.` : 'Đã chốt tiền; công nợ đã ghi cho từng người chơi.')
      } catch (closeError) {
        void reload()
        throw closeError
      }
    }))
  }

  return (
    <>
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>
          <View style={{ marginTop: 12, gap: 10 }}>
            <Text style={[styles.hint, { marginHorizontal: 16, textAlign: 'left' }]}>{session.title} · {formatWeekdayDate(session.startsAtUtc)} · bản nháp{cost.version > 1 ? ` (lần tính ${cost.version})` : ''}</Text>
            {cancelled && <Banner tone="danger" icon="cancel" text="Lịch đánh đã hủy, không tính tiền được." />}
          </View>

          <SectionTitle>Tiền sân</SectionTitle>
          <Card style={{ gap: 14 }}>
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Tiền sân niêm yết</Text>
              <MoneyInput value={draft.courtFee} onChange={(digits) => update({ courtFee: digits })} disabled={busy || cancelled} />
              <Text style={styles.hintLeft}>Dùng để chia tiền cho người chơi. Đã nhập khi tạo lịch, có thể sửa.</Text>
            </View>
            <CourtActualField key={String(cost.courtActualCost ?? 'listed')} sessionId={id} saved={cost.courtActualCost ?? null} listed={feeValue} disabled={busy || cancelled} onSaved={updateCost} />
          </Card>

          <SectionTitle>Số người và phụ phí</SectionTitle>
          <Card style={{ gap: 14 }}>
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Tổng số người chia tiền</Text>
              <View style={styles.stepper}>
                <StepButton icon="minus" label="Bớt một người" disabled={busy || head <= Math.max(1, players.length)} onPress={() => update({ headCount: String(Math.max(players.length, head - 1)) })} />
                <TextInput value={draft.headCount} onChangeText={(text) => update({ headCount: digitsOnly(text) })} keyboardType="number-pad" editable={!busy && !cancelled} style={[styles.input, styles.stepperInput]} accessibilityLabel="Tổng số người" placeholder={String(players.length)} placeholderTextColor={colors.muted} />
                <StepButton icon="plus" label="Thêm một người" disabled={busy || cancelled} onPress={() => update({ headCount: String(head + 1) })} />
              </View>
              <Text style={styles.hintLeft}>Danh sách điểm danh có {players.length} người.{extras > 0 ? ` ${extras} người còn lại tính là "${EXTRA_PREFIX}", không ghi công nợ.` : ' Có thể nhập nhiều hơn nếu có người chưa điểm danh.'}</Text>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Phụ phí mỗi người</Text>
              <MoneyInput value={draft.surchargeAll} onChange={applySurchargeToAll} disabled={busy || cancelled || players.length === 0} />
              <Text style={styles.hintLeft}>{surchargeTotal > 0 ? `Cộng thêm ${formatVnd(surchargeTotal)} vào tổng. ` : ''}Nhập là áp cho mọi người; sửa riêng ở từng người bên dưới. Người miễn thu không tính.</Text>
            </View>
          </Card>

          <SectionTitle>Người chơi ({players.length})</SectionTitle>
          {players.length === 0 ? (
            <View style={{ gap: 10 }}>
              <Banner tone="warn" icon="account-alert-outline" text="Chưa có người có mặt. Điểm danh để chia tiền theo từng người, hoặc nhập tổng số người ở trên." />
              <View style={{ paddingHorizontal: 16 }}><Button label="Mở điểm danh" tone="outline" icon="clipboard-check-outline" onPress={() => router.push({ pathname: '/buoi/[id]/diem-danh', params: { id } })} /></View>
            </View>
          ) : (
            <Card style={{ paddingVertical: 2 }}>
              {players.map((player, index) => {
                const isExempt = draft.exempt.has(player.id)
                const surcharge = draft.surcharges[player.id] ?? 0
                return (
                  <View key={player.id} style={[styles.personRow, isExempt && { opacity: 0.75 }, index === players.length - 1 && extras === 0 && { borderBottomWidth: 0 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Avatar name={player.name} seed={player.playerId ?? player.name} size={30} />
                      <Text style={[ui.rowTitle, { flex: 1 }]} numberOfLines={1}>{player.name}{player.playerId ? '' : ' (khách)'}</Text>
                      <Text style={[styles.amount, isExempt && { textDecorationLine: 'line-through', color: colors.muted }]}>{split[index] !== undefined ? formatVnd(split[index]) : '—'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 40 }}>
                      <Text style={{ fontSize: font.small, color: colors.muted }}>Phụ phí +</Text>
                      <MoneyInput compact value={isExempt || surcharge === 0 ? '' : String(surcharge)} onChange={(digits) => update({ surcharges: { ...draft.surcharges, [player.id]: digits === '' ? 0 : Number(digits) } })} disabled={busy || cancelled || isExempt} style={{ flex: 1 }} />
                      <Pressable accessibilityRole="switch" accessibilityState={{ checked: isExempt }} accessibilityLabel={`Miễn thu ${player.name}`} disabled={busy || cancelled} onPress={() => toggleExempt(player.id)} hitSlop={6}>
                        <Chip label={isExempt ? 'Miễn thu ✓' : 'Miễn thu'} bg={isExempt ? colors.neutral : '#fff'} fg={isExempt ? '#fff' : colors.neutral} style={styles.toggleChip} />
                      </Pressable>
                    </View>
                  </View>
                )
              })}
              {extras > 0 && (
                <View style={[styles.personRow, { borderBottomWidth: 0 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar name="?" size={30} />
                    <Text style={[ui.rowTitle, { flex: 1 }]}>{extras} người chưa gán hồ sơ</Text>
                    <Text style={styles.amount}>{formatVnd(extraShare)}</Text>
                  </View>
                </View>
              )}
            </Card>
          )}

          <SectionTitle>Vật tư đã dùng · {formatVnd(materialAmount)}</SectionTitle>
          {inventory.length === 0 ? <EmptyState icon="package-variant-closed" title="Chưa có vật tư trong kho" message="Có thể bỏ qua." /> : (
            <Card style={{ paddingVertical: 2 }}>
              {inventory.map((item, index) => {
                const text = draft.quantities[item.id] ?? ''
                const quantity = parseQuantity(text)
                const max = available(item)
                return (
                  <View key={item.id} style={[ui.row, index === inventory.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[ui.rowTitle, quantity > 0 && { fontWeight: '600' }]} numberOfLines={1}>{item.name}</Text>
                      <Text style={ui.rowSub}>{formatVnd(item.effectiveSalePrice)}/{item.unit} · còn {formatQuantity(max)}</Text>
                      {quantity > 0 && <Text style={[ui.rowSub, { color: colors.money }]}>{formatVnd(Math.round(quantity * item.effectiveSalePrice))}</Text>}
                    </View>
                    <View style={styles.stepper}>
                      <StepButton icon="minus" label={`Bớt ${item.name}`} disabled={busy || cancelled || quantity <= 0} onPress={() => setQuantity(item.id, String(Math.max(0, Math.round((quantity - 1) * 1000) / 1000)))} />
                      <TextInput value={text === '0' ? '' : text} onChangeText={(value) => setQuantity(item.id, value)} keyboardType="decimal-pad" editable={!busy && !cancelled} placeholder="0" placeholderTextColor={colors.muted} accessibilityLabel={`Số lượng ${item.name}`} style={[styles.input, styles.qtyInput]} />
                      <StepButton icon="plus" label={`Thêm ${item.name}`} disabled={busy || cancelled || quantity + 1 > max} onPress={() => setQuantity(item.id, String(Math.round((quantity + 1) * 1000) / 1000))} />
                    </View>
                  </View>
                )
              })}
            </Card>
          )}

          <SectionTitle>Kết quả</SectionTitle>
          <Card style={{ gap: 6 }}>
            <Text style={{ fontSize: font.small, color: colors.ink }}>Sân {formatVnd(feeValue)} + Vật tư {formatVnd(materialAmount)}{surchargeTotal > 0 ? ` + Phụ phí ${formatVnd(surchargeTotal)}` : ''} = <Text style={{ fontWeight: '700' }}>{formatVnd(total)}</Text></Text>
            <Text style={{ fontSize: font.small, color: colors.ink }}>Mỗi người: <Text style={{ fontWeight: '700', color: colors.money }}>{split.length ? perPersonText(split) : '—'}</Text></Text>
            {exemptCount > 0 && <Text style={{ fontSize: font.small, color: colors.ink }}>Miễn thu {exemptCount} người ({formatVnd(exemptTotal)}) · Cần thu <Text style={{ fontWeight: '700' }}>{formatVnd(total - exemptTotal)}</Text></Text>}
          </Card>
          {formError && <Text style={[styles.errorText, { marginHorizontal: 16, marginTop: 12 }]}>{formError}</Text>}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text style={{ fontSize: font.small, color: colors.muted }}>{head} người{draft.dirty ? ' · chưa lưu' : ''}</Text>
            <Text style={{ flex: 1, textAlign: 'right', fontSize: font.small, color: colors.ink }} numberOfLines={2}>{split.length ? perPersonText(split) : 'Chưa có người để chia'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Lưu nháp" tone="outline" icon="content-save-outline" busy={action === 'save'} disabled={busy || cancelled} onPress={save} style={{ flex: 1 }} />
            <Button label={`Chốt ${formatVnd(total)}`} tone="money" icon="lock-check-outline" busy={action === 'close'} disabled={busy || cancelled || head < 1} onPress={close} style={{ flex: 1.5 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
      {reasonModal}
    </>
  )
}

function MoneyInput({ value, onChange, placeholder = '0', disabled, compact, style }: { value: string; onChange: (digits: string) => void; placeholder?: string; disabled?: boolean; compact?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.moneyBox, compact && styles.moneyCompact, disabled && { opacity: 0.55 }, style]}>
      <TextInput
        value={value === '' ? '' : groupDigits(value)}
        onChangeText={(text) => onChange(digitsOnly(text))}
        keyboardType="number-pad"
        editable={!disabled}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[styles.moneyInput, compact && { minHeight: 38, fontSize: font.small }]}
      />
      <Text style={{ color: colors.muted, fontSize: compact ? font.small : font.body }}>₫</Text>
    </View>
  )
}

function StepButton({ icon, label, disabled, onPress }: { icon: 'minus' | 'plus'; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.stepButton, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      <Text style={{ fontSize: 22, lineHeight: 24, color: colors.money, fontWeight: '600' }}>{icon === 'minus' ? '−' : '+'}</Text>
    </Pressable>
  )
}

/** Tiền sân thực trả cho chủ sân: lưu riêng, sửa được cả khi đã chốt vì không đổi tiền chia cho người chơi. */
function CourtActualField({ sessionId, saved, listed, disabled, onSaved }: { sessionId: string; saved: number | null; listed: number; disabled: boolean; onSaved: (cost: BillingCost) => void }) {
  const notify = useToast()
  const [value, setValue] = useState(saved === null ? '' : String(saved))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const next = value === '' ? null : Number(value)
  const diff = listed - (next ?? listed)
  const save = async () => {
    if (next !== null && (!Number.isSafeInteger(next) || next < 0)) { setError('Tiền sân thực trả phải là số nguyên VNĐ, không âm.'); return }
    setBusy(true)
    setError(null)
    try {
      onSaved(await setCourtActualCost(sessionId, next))
      notify('success', next === null ? 'Tiền sân thực trả tính bằng giá niêm yết.' : `Đã lưu tiền sân thực trả ${formatVnd(next)}.`)
    } catch (saveError) {
      setError(errorMessage(saveError, 'Không thể lưu tiền sân thực trả.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>Tiền sân thực trả</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MoneyInput value={value} onChange={(digits) => { setValue(digits); setError(null) }} placeholder={groupDigits(String(listed))} disabled={disabled || busy} style={{ flex: 1 }} />
        {next !== saved && <Button label="Lưu" tone="outline" icon="check" busy={busy} disabled={disabled} onPress={() => void save()} />}
      </View>
      <Text style={error ? styles.errorText : styles.hintLeft}>
        {error ?? (diff === 0 ? 'Trả cho chủ sân, chỉ dùng để đối soát. Để trống = bằng giá niêm yết.' : diff > 0 ? `Thu theo niêm yết hơn thực trả ${formatVnd(diff)}.` : `Thực trả hơn niêm yết ${formatVnd(-diff)}.`)}
      </Text>
    </View>
  )
}

/** Thu theo buổi ghi tay (tiền mặt, chuyển khoản…) để tất toán buổi; hủy khoản nhập nhầm kèm lý do. */
function CollectionPanel({ sessionId, cost, disabled, onUpdated, onCancel }: { sessionId: string; cost: BillingCost; disabled: boolean; onUpdated: (cost: BillingCost) => void; onCancel: (collection: SessionCollection) => void }) {
  const notify = useToast()
  const remaining = Math.max(0, cost.totalAmount - (cost.exemptAmount ?? 0) - cost.collectedAmount)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<SessionCollectionMethod>('cash')
  const [payerName, setPayerName] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Giữ cùng một khóa khi bấm lại sau lỗi mạng để server không ghi trùng; đổi nội dung thì tạo khóa mới.
  const keyRef = useRef<string | null>(null)
  const edit = (apply: () => void) => { apply(); keyRef.current = null; setError(null) }
  const collections = cost.collections ?? []
  const locked = disabled || busy

  const submit = async () => {
    const value = Number(amount)
    if (!Number.isSafeInteger(value) || value <= 0) { setError('Nhập số tiền thu là số nguyên lớn hơn 0.'); return }
    if (value > remaining) { setError(`Số tiền vượt phần còn thiếu (${formatVnd(remaining)}).`); return }
    keyRef.current ??= newIdempotencyKey(`collect-${sessionId}`)
    setBusy(true)
    setError(null)
    try {
      const next = await recordSessionCollection(sessionId, { amount: value, method, payerName: payerName.trim() || null, collectedDate: null, notes: notes.trim() || null, idempotencyKey: keyRef.current })
      keyRef.current = null
      onUpdated(next)
      setAmount(''); setPayerName(''); setNotes('')
      notify('success', next.collectedAmount >= next.totalAmount - (next.exemptAmount ?? 0) ? 'Đã ghi nhận khoản thu — buổi đã thu đủ.' : `Đã ghi nhận ${formatVnd(value)} (${collectionMethodLabels[method].toLowerCase()}).`)
    } catch (recordError) {
      setError(errorMessage(recordError, 'Không thể ghi nhận khoản thu.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card style={{ gap: 10 }}>
      {remaining > 0 ? (
        <>
          <Text style={styles.hintLeft}>Dùng khi thu gộp cả buổi không qua công nợ từng người. Còn thiếu {formatVnd(remaining)}.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(Object.keys(collectionMethodLabels) as SessionCollectionMethod[]).map((key) => (
              <Pressable key={key} accessibilityRole="radio" accessibilityState={{ checked: method === key }} disabled={locked} onPress={() => edit(() => setMethod(key))}>
                <Chip label={collectionMethodLabels[key]} bg={method === key ? colors.money : '#fff'} fg={method === key ? '#fff' : colors.ink} style={[styles.toggleChip, { borderColor: method === key ? colors.money : colors.line }]} />
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <MoneyInput value={amount} onChange={(digits) => edit(() => setAmount(digits))} placeholder="Số tiền" disabled={locked} style={{ flex: 1 }} />
            <Button label="Thu đủ" tone="outline" disabled={locked} onPress={() => edit(() => setAmount(String(remaining)))} />
          </View>
          <TextInput value={payerName} onChangeText={(text) => edit(() => setPayerName(text))} maxLength={160} editable={!locked} placeholder="Người nộp (không bắt buộc)" placeholderTextColor={colors.muted} style={styles.input} />
          <TextInput value={notes} onChangeText={(text) => edit(() => setNotes(text))} maxLength={500} editable={!locked} placeholder="Ghi chú (không bắt buộc)" placeholderTextColor={colors.muted} style={styles.input} />
          {error && <Text style={styles.errorText}>{error}</Text>}
          <Button label="Ghi nhận đã thu" tone="money" icon="cash-check" busy={busy} disabled={locked || amount === ''} onPress={() => void submit()} />
        </>
      ) : (
        <>
          <Banner tone="ok" icon="check-circle-outline" text="Buổi đã thu đủ tiền." />
          {error && <Text style={styles.errorText}>{error}</Text>}
        </>
      )}
      {collections.length > 0 && (
        <View>
          {collections.map((item) => (
            <View key={item.id} style={[ui.row, { alignItems: 'flex-start' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[ui.rowTitle, item.status === 'cancelled' && { textDecorationLine: 'line-through', color: colors.muted }]}>
                  {formatVnd(item.amount)} · {collectionMethodLabels[item.method]}{item.payerName ? ` · ${item.payerName}` : ''}
                </Text>
                <Text style={ui.rowSub}>{formatIsoDate(item.collectedDate)} · {item.recordedByName} ghi lúc {formatTime(item.createdAtUtc)} {formatDate(item.createdAtUtc)}{item.notes ? ` · ${item.notes}` : ''}</Text>
                {item.status === 'cancelled' && <Text style={[ui.rowSub, { color: colors.danger }]}>Đã hủy: {item.cancelReason}</Text>}
              </View>
              {item.status === 'posted' && <Button label="Hủy" tone="danger" icon="undo-variant" disabled={locked} onPress={() => onCancel(item)} style={{ minHeight: 38, paddingHorizontal: 12 }} />}
            </View>
          ))}
        </View>
      )}
    </Card>
  )
}

/** Hộp nhập lý do (tối thiểu 3 ký tự), dùng thay Alert.prompt vì Alert.prompt chỉ có trên iOS. */
function ReasonModal({ title, message, confirmLabel, busy, onCancel, onConfirm }: { title: string; message: string; confirmLabel: string; busy: boolean; onCancel: () => void; onConfirm: (reason: string) => void }) {
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
          <TextInput value={reason} onChangeText={(text) => { setReason(text); setError(null) }} autoFocus multiline maxLength={500} editable={!busy} placeholder="Lý do (tối thiểu 3 ký tự)" placeholderTextColor={colors.muted} style={[styles.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }]} />
          {error && <Text style={styles.errorText}>{error}</Text>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Không" tone="outline" disabled={busy} onPress={onCancel} style={{ flex: 1 }} />
            <Button label={confirmLabel} tone="money" busy={busy} onPress={submit} style={{ flex: 1 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.money, padding: 16, paddingTop: 18 },
  heroSub: { color: colors.moneyLight, fontSize: font.small },
  heroBig: { color: '#fff', fontSize: font.big, fontWeight: '700', marginTop: 4 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.moneyMid, marginTop: 6 },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.brandLight },
  label: { fontSize: font.small, fontWeight: '600', color: colors.ink },
  hint: { fontSize: font.caption, color: colors.muted, textAlign: 'center' },
  hintLeft: { fontSize: font.caption, color: colors.muted },
  errorText: { fontSize: font.small, color: colors.danger },
  amount: { fontSize: font.body, color: colors.ink },
  input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', paddingHorizontal: 12, fontSize: font.body, color: colors.ink },
  moneyBox: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', paddingHorizontal: 12 },
  moneyCompact: { paddingHorizontal: 10, borderRadius: 10 },
  moneyInput: { flex: 1, minHeight: 46, fontSize: font.body, color: colors.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepButton: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.moneyLight, backgroundColor: colors.moneySoft, alignItems: 'center', justifyContent: 'center' },
  stepperInput: { flex: 1, textAlign: 'center' },
  qtyInput: { width: 58, textAlign: 'center', paddingHorizontal: 4 },
  personRow: { gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  toggleChip: { paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line },
  footer: { gap: 10, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12 },
})
