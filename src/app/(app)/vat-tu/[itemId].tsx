import { router, Stack, useLocalSearchParams, type Href } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { bangkokToday, formatDate, formatTime, formatVnd } from '@/lib/format'
import {
  createInventoryItem, formatQuantity, getInventoryItem, getStockTransactions, parseQuantity, parseVnd, recordStock, reverseStock,
  transactionLabels, updateInventoryItem, updateInventoryPrice, type InventoryItem, type ManualStockType, type StockTransaction, type UpsertInventoryItemInput,
} from '@/lib/services/inventory'
import { useLoad } from '@/lib/useLoad'
import { Banner, Button, Card, Chip, EmptyState, ErrorState, Icon, Loading, SectionTitle, styles as ui } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const MAX_PRICE = 100_000_000
const manualTypes: ManualStockType[] = ['purchase', 'damaged', 'lost', 'adjustment']
type SheetState = 'stock' | 'price' | 'edit' | { reverse: StockTransaction } | null

// Cast vì danh sách route có kiểu (.expo/types) chỉ sinh lại khi chạy dev server.
const itemHref = (item: Pick<InventoryItem, 'id' | 'code'>) => ({ pathname: '/vat-tu/[itemId]', params: { itemId: item.id, code: item.code } }) as unknown as Href

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n${message}`)) onConfirm(); return }
  Alert.alert(title, message, [{ text: 'Không', style: 'cancel' }, { text: 'Đồng ý', style: 'destructive', onPress: onConfirm }])
}

const formatDay = (value: string) => { const [year, month, day] = value.split('-'); return `${day}/${month}/${year}` }
const blank = (value: string | null | undefined) => value?.trim() || null
const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Chi tiết một vật tư (itemId = "moi" là màn thêm mới): thông tin, giá, ghi giao dịch kho và lịch sử có đảo. */
export default function InventoryItemScreen() {
  const { itemId, code } = useLocalSearchParams<{ itemId: string; code?: string }>()
  const roles = useAuth().user?.roles ?? []
  // Server chỉ cho Quản trị, Kế toán đọc và ghi kho.
  const canManage = roles.includes('ADMIN') || roles.includes('TREASURER')
  if (!canManage) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: 'Vật tư' }} />
        <EmptyState icon="lock-outline" title="Không có quyền xem kho" message="Chỉ Quản trị và Kế toán được xem và quản lý vật tư." />
      </View>
    )
  }
  if (itemId === 'moi') return <NewItemScreen />
  return <ItemDetail itemId={itemId} code={code} />
}

function NewItemScreen() {
  const insets = useSafeAreaInsets()
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Thêm vật tư' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Banner tone="warn" icon="information-outline" text="Số tồn chỉ thay đổi bằng giao dịch kho để giữ lịch sử. Sau khi thêm, ghi giao dịch Nhập mua để có tồn." />
        <View style={[styles.formCard, { marginTop: 12 }]}>
          <ItemForm item={null} onCancel={() => router.back()} onSaved={(saved) => router.replace(itemHref(saved))} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function ItemDetail({ itemId, code }: { itemId: string; code?: string }) {
  const notify = useToast()
  const [sheet, setSheet] = useState<SheetState>(null)
  const [moreTx, setMoreTx] = useState<{ page: number; items: StockTransaction[] } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const { data, error, loading, refreshing, reload } = useLoad(async () => {
    const [item, transactions] = await Promise.all([getInventoryItem(itemId, code), getStockTransactions(itemId)])
    setMoreTx(null)
    return { item, transactions }
  }, itemId)

  if (loading) return <><Stack.Screen options={{ title: 'Vật tư' }} /><Loading label="Đang tải vật tư…" /></>
  if (error || !data) return <><Stack.Screen options={{ title: 'Vật tư' }} /><ErrorState message={error ?? 'Không tải được vật tư.'} onRetry={() => void reload()} /></>

  const { item, transactions } = data
  const rows = [...transactions.items, ...(moreTx?.items ?? [])]
  const lastPage = moreTx?.page ?? transactions.page
  const reversedIds = new Set(rows.map((row) => row.reversesTransactionId).filter((id): id is number => id !== null))
  const done = () => { setSheet(null); void reload() }

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const next = await getStockTransactions(itemId, lastPage + 1)
      setMoreTx({ page: next.page, items: [...(moreTx?.items ?? []), ...next.items] })
    } catch (loadError) {
      notify('error', errorMessage(loadError, 'Không tải thêm được lịch sử.'))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: item.name }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}>
        <View style={[styles.hero, item.isLowStock && { backgroundColor: '#F6DDB4' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={styles.code}>{item.code}</Text>
            {item.isLowStock && <Chip label="Sắp hết" icon="alert-outline" bg={colors.warn} fg="#fff" />}
            {!item.isActive && <Chip label="Ngừng sử dụng" bg={colors.neutralSoft} fg={colors.neutral} />}
          </View>
          <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.warnDark, marginTop: 6 }}>{item.name}</Text>
          <Text style={{ fontSize: font.small, color: colors.warn }}>{item.category} · đơn vị {item.unit}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 10 }}>
            <Text style={{ fontSize: font.big, fontWeight: '700', color: colors.warnDark }}>{formatQuantity(item.stockOnHand)}</Text>
            <Text style={{ fontSize: font.body, color: colors.warn }}>{item.unit} trong kho</Text>
          </View>
        </View>

        <Card style={{ marginTop: 14, paddingVertical: 2 }}>
          <InfoRow label="Tồn tối thiểu" value={`${formatQuantity(item.minimumStock)} ${item.unit}`} />
          <InfoRow label={`Giá nhập/${item.unit}`} value={formatVnd(item.averageCost)} hint="Giá vốn bình quân" />
          <InfoRow label={`Giá xuất/${item.unit}`} value={formatVnd(item.effectiveSalePrice)} hint={item.salePrice === null ? 'Đang theo giá vốn' : `Chênh ${formatVnd(item.effectiveSalePrice - item.averageCost)}`} />
          <InfoRow label="Giá nhập lần cuối" value={formatVnd(item.lastPurchasePrice)} />
          <InfoRow label="Nhà cung cấp" value={item.supplier || '—'} />
          {item.notes ? <InfoRow label="Ghi chú" value={item.notes} last /> : <InfoRow label="Cập nhật" value={`${formatTime(item.updatedAtUtc)} ${formatDate(item.updatedAtUtc)}`} last />}
        </Card>

        <View style={styles.actions}>
          <Button label="Ghi giao dịch kho" icon="swap-vertical" onPress={() => setSheet('stock')} disabled={!item.isActive} style={{ backgroundColor: colors.warn, borderColor: colors.warn }} />
          {!item.isActive && <Text style={styles.hint}>Vật tư đã ngừng sử dụng nên không ghi giao dịch được. Bật lại trong Sửa thông tin.</Text>}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Đổi giá" icon="tag-outline" tone="outline" onPress={() => setSheet('price')} style={styles.outlineAmber} />
            <Button label="Sửa thông tin" icon="pencil-outline" tone="outline" onPress={() => setSheet('edit')} style={styles.outlineAmber} />
          </View>
        </View>

        <SectionTitle>Lịch sử kho ({transactions.totalItems})</SectionTitle>
        <Text style={[styles.hint, { marginHorizontal: 16, marginTop: -4, marginBottom: 8 }]}>Mọi thay đổi tồn được lưu thành dòng bất biến; sửa sai bằng cách đảo giao dịch.</Text>
        {rows.length === 0 ? <EmptyState icon="history" title="Chưa có giao dịch" message="Ghi giao dịch Nhập mua để bắt đầu theo dõi tồn." /> : (
          <Card style={{ paddingVertical: 2 }}>
            {rows.map((row, index) => (
              <TransactionRow key={row.id} row={row} unit={item.unit} last={index === rows.length - 1} reversed={reversedIds.has(row.id)} onReverse={() => setSheet({ reverse: row })} />
            ))}
          </Card>
        )}
        {lastPage < transactions.totalPages && (
          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            <Button label="Xem thêm giao dịch" tone="outline" icon="chevron-down" busy={loadingMore} onPress={() => void loadMore()} style={styles.outlineAmber} />
          </View>
        )}
      </ScrollView>

      <Sheet visible={sheet === 'stock'} title={`Giao dịch · ${item.name}`} subtitle={`Tồn hiện tại: ${formatQuantity(item.stockOnHand)} ${item.unit}. Vật tư dùng cho lịch đánh được ghi ngay khi tính tiền buổi.`} onClose={() => setSheet(null)}>
        {sheet === 'stock' && <StockForm item={item} onCancel={() => setSheet(null)} onSaved={done} />}
      </Sheet>
      <Sheet visible={sheet === 'price'} title="Đổi giá" subtitle="Lịch đánh đã chốt giữ giá cũ; mọi lần đổi giá đều được ghi nhật ký." onClose={() => setSheet(null)}>
        {sheet === 'price' && <PriceForm item={item} onCancel={() => setSheet(null)} onSaved={done} />}
      </Sheet>
      <Sheet visible={sheet === 'edit'} title="Cập nhật vật tư" subtitle="Số tồn chỉ thay đổi bằng giao dịch kho để giữ lịch sử." onClose={() => setSheet(null)}>
        {sheet === 'edit' && <ItemForm item={item} onCancel={() => setSheet(null)} onSaved={done} />}
      </Sheet>
      <Sheet visible={typeof sheet === 'object' && sheet !== null} title="Đảo giao dịch" subtitle="Tạo một giao dịch ngược chiều; giao dịch gốc vẫn được giữ nguyên." onClose={() => setSheet(null)}>
        {typeof sheet === 'object' && sheet !== null && <ReverseForm row={sheet.reverse} item={item} onCancel={() => setSheet(null)} onSaved={done} />}
      </Sheet>
    </View>
  )
}

function InfoRow({ label, value, hint, last }: { label: string; value: string; hint?: string; last?: boolean }) {
  return (
    <View style={[ui.row, last && { borderBottomWidth: 0 }]}>
      <Text style={{ fontSize: font.small, color: colors.muted, width: 128 }}>{label}</Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={{ fontSize: font.body, color: colors.ink, textAlign: 'right' }}>{value}</Text>
        {hint && <Text style={ui.rowSub}>{hint}</Text>}
      </View>
    </View>
  )
}

function TransactionRow({ row, unit, last, reversed, onReverse }: { row: StockTransaction; unit: string; last: boolean; reversed: boolean; onReverse: () => void }) {
  const positive = row.quantityChange > 0
  const canReverse = row.type !== 'reversal' && !reversed
  return (
    <View style={[styles.txRow, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: font.body, fontWeight: '600', color: colors.ink }}>{transactionLabels[row.type]}</Text>
          <Text style={{ fontSize: font.body, fontWeight: '700', color: positive ? colors.ok : colors.danger }}>{positive ? '+' : ''}{formatQuantity(row.quantityChange)} {unit}</Text>
          {reversed && <Chip label="Đã đảo" bg={colors.neutralSoft} fg={colors.neutral} style={{ paddingVertical: 2, paddingHorizontal: 8 }} />}
        </View>
        <Text style={ui.rowSub}>{formatDay(row.transactionDate)} · ghi lúc {formatTime(row.createdAtUtc)} {formatDate(row.createdAtUtc)}{row.reversesTransactionId ? ` · đảo #${row.reversesTransactionId}` : ''}</Text>
        <Text style={ui.rowSub}>{formatVnd(row.unitCost)}/{unit} · giá trị {formatVnd(row.totalValue)}{row.supplier ? ` · ${row.supplier}` : ''}</Text>
        <Text style={{ fontSize: font.small, color: colors.ink, marginTop: 2 }}>{row.reason}</Text>
      </View>
      {canReverse && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Đảo giao dịch ${transactionLabels[row.type]}`} onPress={onReverse} style={({ pressed }) => [styles.reverseButton, { opacity: pressed ? 0.7 : 1 }]}>
          <Icon name="undo-variant" size={20} color={colors.warn} />
          <Text style={{ fontSize: font.caption, color: colors.warn }}>Đảo</Text>
        </Pressable>
      )}
    </View>
  )
}

function Sheet({ visible, title, subtitle, onClose, children }: { visible: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Đóng" onPress={onClose} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.title, fontWeight: '700', color: colors.ink }}>{title}</Text>
                {subtitle && <Text style={[styles.hint, { marginTop: 2 }]}>{subtitle}</Text>}
              </View>
              <Pressable accessibilityLabel="Đóng" onPress={onClose} hitSlop={8} style={styles.close}><Icon name="close" color={colors.muted} /></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 12 }}>{children}</ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}{required && <Text style={{ color: colors.danger }}> *</Text>}</Text>
      {children}
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  )
}

function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.multiline && { minHeight: 72, textAlignVertical: 'top', paddingTop: 10 }, props.style]} />
}

function FormFooter({ saving, label, onCancel, onSubmit, error, danger }: { saving: boolean; label: string; onCancel: () => void; onSubmit: () => void; error: string | null; danger?: boolean }) {
  return (
    <View style={{ gap: 10, marginTop: 4 }}>
      {error && <Banner tone="danger" icon="alert-circle-outline" text={error} />}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Hủy" tone="outline" onPress={onCancel} disabled={saving} style={{ flex: 1, borderColor: colors.line }} />
        <Button label={label} tone={danger ? 'danger' : 'brand'} busy={saving} onPress={onSubmit} style={[{ flex: 2 }, !danger && { backgroundColor: colors.warn, borderColor: colors.warn }]} />
      </View>
    </View>
  )
}

function ItemForm({ item, onCancel, onSaved }: { item: InventoryItem | null; onCancel: () => void; onSaved: (saved: InventoryItem) => void }) {
  const notify = useToast()
  const [form, setForm] = useState(() => item
    ? { code: item.code, name: item.name, category: item.category, unit: item.unit, minimumStock: formatQuantity(item.minimumStock).replace(/\./g, ''), supplier: item.supplier ?? '', isActive: item.isActive, notes: item.notes ?? '' }
    : { code: '', name: '', category: 'Cầu', unit: 'ống', minimumStock: '5', supplier: '', isActive: true, notes: '' })
  // Giá nhập/giá xuất chỉ nhập lúc thêm mới (như web); vật tư đã có đổi giá ở mục Đổi giá kèm lý do.
  const [price, setPrice] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => { setForm((current) => ({ ...current, [key]: value })); setError(null) }
  const unitLabel = form.unit.trim() || 'đơn vị'

  const submit = async () => {
    const code = form.code.trim(); const name = form.name.trim(); const category = form.category.trim(); const unit = form.unit.trim()
    if (!code || !name || !category || !unit) { setError('Mã, tên, nhóm và đơn vị là bắt buộc.'); return }
    if (code.length > 40 || name.length < 2 || name.length > 160 || category.length < 2 || category.length > 100 || unit.length > 30) {
      setError('Mã tối đa 40 ký tự; tên 2–160; nhóm 2–100; đơn vị tối đa 30 ký tự.'); return
    }
    const minimumStock = parseQuantity(form.minimumStock)
    if (minimumStock === null) { setError('Mức tồn tối thiểu phải là số không âm, tối đa 3 chữ số thập phân.'); return }
    const unitPrice = price.trim() === '' ? null : parseVnd(price)
    const sale = salePrice.trim() === '' ? null : parseVnd(salePrice)
    if ((price.trim() !== '' && (unitPrice === null || unitPrice > MAX_PRICE)) || (salePrice.trim() !== '' && (sale === null || sale > MAX_PRICE))) {
      setError('Giá nhập và giá xuất phải là số nguyên VNĐ, không âm, tối đa 100.000.000.'); return
    }
    const input: UpsertInventoryItemInput = { code, name, category, unit, minimumStock, supplier: blank(form.supplier), isActive: form.isActive, notes: blank(form.notes) }
    setSaving(true); setError(null)
    let saved: InventoryItem
    try {
      saved = item ? await updateInventoryItem(item.id, input) : await createInventoryItem(input)
    } catch (submitError) {
      setError(errorMessage(submitError, 'Không thể lưu vật tư.')); setSaving(false); return
    }
    const costChanged = unitPrice !== null && unitPrice !== saved.averageCost
    const saleChanged = sale !== null && sale !== saved.effectiveSalePrice
    if (costChanged || saleChanged) {
      try {
        saved = await updateInventoryPrice(saved.id, { unitPrice: costChanged ? unitPrice : null, salePrice: saleChanged ? sale : null })
      } catch (priceError) {
        // Vật tư đã được tạo; báo lỗi giá để người dùng đổi lại ở mục Đổi giá, không tạo trùng.
        notify('error', `Đã lưu vật tư nhưng chưa lưu được giá: ${errorMessage(priceError)}`)
        setSaving(false); onSaved(saved); return
      }
    }
    notify('success', item ? 'Đã cập nhật vật tư.' : 'Đã thêm vật tư.')
    setSaving(false)
    onSaved(saved)
  }

  return (
    <View style={{ gap: 12 }}>
      <Field label="Mã vật tư" required><Input value={form.code} onChangeText={(value) => set('code', value)} autoCapitalize="characters" autoCorrect={false} placeholder="VD: CAU-TT" /></Field>
      <Field label="Tên vật tư" required><Input value={form.name} onChangeText={(value) => set('name', value)} /></Field>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Field label="Nhóm" required><Input value={form.category} onChangeText={(value) => set('category', value)} /></Field></View>
        <View style={{ flex: 1 }}><Field label="Đơn vị" required><Input value={form.unit} onChangeText={(value) => set('unit', value)} placeholder="quả, ống, chai" /></Field></View>
      </View>
      {!item && (
        <>
          <Field label={`Giá nhập/${unitLabel} (VNĐ)`} hint="Vốn bỏ ra; tự cập nhật theo bình quân khi nhập hàng.">
            <Input value={price} onChangeText={(value) => { setPrice(value); setError(null) }} keyboardType="number-pad" placeholder="VD: 15000" />
          </Field>
          <Field label={`Giá xuất/${unitLabel} (VNĐ)`} hint={`${salePrice.trim() !== '' && price.trim() !== '' && parseVnd(salePrice) !== null && parseVnd(price) !== null ? `Chênh ${formatVnd(parseVnd(salePrice)! - parseVnd(price)!)}/${unitLabel} · ` : ''}Giá tính cho người chơi khi chia tiền.`}>
            <Input value={salePrice} onChangeText={(value) => { setSalePrice(value); setError(null) }} keyboardType="number-pad" placeholder="VD: 20000" />
          </Field>
        </>
      )}
      <Field label={`Mức tồn tối thiểu (${unitLabel})`} hint="Tồn bằng hoặc dưới mức này sẽ báo sắp hết.">
        <Input value={form.minimumStock} onChangeText={(value) => set('minimumStock', value)} keyboardType="decimal-pad" />
      </Field>
      <Field label="Nhà cung cấp"><Input value={form.supplier} onChangeText={(value) => set('supplier', value)} /></Field>
      <Field label="Trạng thái">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Option label="Đang sử dụng" selected={form.isActive} onPress={() => set('isActive', true)} />
          <Option label="Ngừng sử dụng" selected={!form.isActive} onPress={() => set('isActive', false)} />
        </View>
      </Field>
      <Field label="Ghi chú"><Input value={form.notes} onChangeText={(value) => set('notes', value)} multiline /></Field>
      <FormFooter saving={saving} label="Lưu vật tư" onCancel={onCancel} onSubmit={() => void submit()} error={error} />
    </View>
  )
}

function PriceForm({ item, onCancel, onSaved }: { item: InventoryItem; onCancel: () => void; onSaved: () => void }) {
  const notify = useToast()
  const [price, setPrice] = useState(String(item.averageCost))
  const [salePrice, setSalePrice] = useState(String(item.effectiveSalePrice))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cost = parseVnd(price)
  const sale = parseVnd(salePrice)

  const submit = async () => {
    if (cost === null || sale === null || cost > MAX_PRICE || sale > MAX_PRICE) { setError('Giá nhập và giá xuất phải là số nguyên VNĐ, không âm, tối đa 100.000.000.'); return }
    if (reason.trim().length > 500) { setError('Lý do tối đa 500 ký tự.'); return }
    // Như web: chỉ gửi giá đã đổi; giá xuất so với giá xuất hiện hành (giá vốn nếu chưa đặt riêng).
    const costChanged = cost !== item.averageCost
    const saleChanged = sale !== item.effectiveSalePrice
    if (!costChanged && !saleChanged) { setError('Giá chưa thay đổi.'); return }
    setSaving(true); setError(null)
    try {
      await updateInventoryPrice(item.id, { unitPrice: costChanged ? cost : null, salePrice: saleChanged ? sale : null }, blank(reason))
      notify('success', 'Đã cập nhật giá vật tư.')
      onSaved()
    } catch (submitError) {
      setError(errorMessage(submitError, 'Không thể đổi giá.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <Field label={`Giá nhập/${item.unit} (VNĐ)`} hint={`Hiện tại ${formatVnd(item.averageCost)}. Tự cập nhật theo bình quân khi nhập hàng.`}>
        <Input value={price} onChangeText={(value) => { setPrice(value); setError(null) }} keyboardType="number-pad" />
      </Field>
      <Field label={`Giá xuất/${item.unit} (VNĐ)`} hint={`${cost !== null && sale !== null ? `Chênh ${formatVnd(sale - cost)}/${item.unit} · ` : ''}${item.salePrice === null ? 'Đang theo giá vốn. ' : ''}Giá tính cho người chơi khi chia tiền.`}>
        <Input value={salePrice} onChangeText={(value) => { setSalePrice(value); setError(null) }} keyboardType="number-pad" />
      </Field>
      <Field label="Lý do đổi giá"><Input value={reason} onChangeText={(value) => { setReason(value); setError(null) }} placeholder="VD: nhà cung cấp tăng giá" maxLength={500} /></Field>
      <FormFooter saving={saving} label="Lưu giá" onCancel={onCancel} onSubmit={() => void submit()} error={error} />
    </View>
  )
}

function StockForm({ item, onCancel, onSaved }: { item: InventoryItem; onCancel: () => void; onSaved: () => void }) {
  const notify = useToast()
  const [type, setType] = useState<ManualStockType>('purchase')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState(String(item.lastPurchasePrice))
  const [date, setDate] = useState(bangkokToday())
  const [supplier, setSupplier] = useState(item.supplier ?? '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const withCost = type === 'purchase' || type === 'adjustment'
  const cost = parseVnd(unitCost)

  const submit = async () => {
    const qty = parseQuantity(quantity, type === 'adjustment')
    if (qty === null || qty === 0) {
      setError(type === 'adjustment' ? 'Số lượng điều chỉnh phải khác 0 (âm để giảm), tối đa 3 chữ số thập phân.' : 'Số lượng phải lớn hơn 0, tối đa 3 chữ số thập phân.'); return
    }
    if (withCost && (cost === null || cost > MAX_PRICE)) { setError('Giá nhập phải là số nguyên VNĐ, không âm.'); return }
    if (!isValidDate(date)) { setError('Ngày giao dịch phải có dạng yyyy-MM-dd.'); return }
    if (reason.trim().length < 2) { setError('Lý do là bắt buộc (tối thiểu 2 ký tự).'); return }
    // Server tự đổi dấu: nhập mua cộng, hỏng/mất trừ, điều chỉnh giữ nguyên dấu.
    const change = type === 'purchase' ? qty : type === 'adjustment' ? qty : -qty
    if (item.stockOnHand + change < 0) { setError(`Tồn kho không đủ: hiện còn ${formatQuantity(item.stockOnHand)} ${item.unit}.`); return }
    setSaving(true); setError(null)
    try {
      await recordStock(item.id, { type, quantity: qty, unitCost: withCost ? cost! : item.lastPurchasePrice, transactionDate: date, playSessionId: null, supplier: type === 'purchase' ? blank(supplier) : null, reason: reason.trim() })
      notify('success', 'Giao dịch kho đã được ghi nhận.')
      onSaved()
    } catch (submitError) {
      setError(errorMessage(submitError, 'Không thể ghi giao dịch.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <Field label="Loại giao dịch">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {manualTypes.map((value) => <Option key={value} label={transactionLabels[value]} selected={type === value} onPress={() => { setType(value); setError(null) }} />)}
        </View>
      </Field>
      <Field label={`Số lượng (${item.unit})`} hint={type === 'adjustment' ? 'Nhập số âm để giảm tồn, số dương để tăng.' : type === 'purchase' ? 'Cộng vào tồn.' : 'Trừ khỏi tồn.'}>
        <Input value={quantity} onChangeText={(value) => { setQuantity(value); setError(null) }} keyboardType={type === 'adjustment' ? 'numbers-and-punctuation' : 'decimal-pad'} />
      </Field>
      {withCost && (
        <Field label={`Giá nhập/${item.unit} (VNĐ)`} hint={`${formatVnd(cost ?? 0)}/${item.unit}${type === 'purchase' ? ' · giá vốn bình quân sẽ được tính lại' : ''}`}>
          <Input value={unitCost} onChangeText={(value) => { setUnitCost(value); setError(null) }} keyboardType="number-pad" />
        </Field>
      )}
      <Field label="Ngày giao dịch" hint="Dạng yyyy-MM-dd, theo giờ Việt Nam.">
        <Input value={date} onChangeText={(value) => { setDate(value); setError(null) }} keyboardType="numbers-and-punctuation" placeholder="yyyy-MM-dd" maxLength={10} />
      </Field>
      {type === 'purchase' && <Field label="Nhà cung cấp"><Input value={supplier} onChangeText={setSupplier} /></Field>}
      <Field label="Lý do" required>
        <Input value={reason} onChangeText={(value) => { setReason(value); setError(null) }} placeholder="VD: nhập bổ sung tháng 8" maxLength={500} />
      </Field>
      <FormFooter saving={saving} label="Ghi giao dịch" onCancel={onCancel} onSubmit={() => void submit()} error={error} />
    </View>
  )
}

function ReverseForm({ row, item, onCancel, onSaved }: { row: StockTransaction; item: InventoryItem; onCancel: () => void; onSaved: () => void }) {
  const notify = useToast()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const change = -row.quantityChange

  const submit = () => {
    if (reason.trim().length < 3) { setError('Nhập lý do đảo giao dịch (tối thiểu 3 ký tự).'); return }
    if (item.stockOnHand + change < 0) { setError(`Không thể đảo vì tồn hiện tại (${formatQuantity(item.stockOnHand)} ${item.unit}) không đủ.`); return }
    confirmAction('Đảo giao dịch', `Tồn ${item.name} sẽ ${change > 0 ? 'tăng' : 'giảm'} ${formatQuantity(Math.abs(change))} ${item.unit}. Giao dịch gốc vẫn được giữ.`, () => void (async () => {
      setSaving(true); setError(null)
      try {
        await reverseStock(row.id, reason.trim())
        notify('success', 'Đã tạo giao dịch đảo, lịch sử gốc được giữ nguyên.')
        onSaved()
      } catch (reverseError) {
        setError(errorMessage(reverseError, 'Không thể đảo giao dịch.'))
      } finally {
        setSaving(false)
      }
    })())
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.reverseSummary}>
        <Text style={{ fontSize: font.body, fontWeight: '600', color: colors.ink }}>{transactionLabels[row.type]} · {row.quantityChange > 0 ? '+' : ''}{formatQuantity(row.quantityChange)} {item.unit}</Text>
        <Text style={ui.rowSub}>{formatDay(row.transactionDate)} · {formatVnd(row.totalValue)} · {row.reason}</Text>
      </View>
      <Field label="Lý do đảo" required>
        <Input value={reason} onChangeText={(value) => { setReason(value); setError(null) }} placeholder="VD: ghi nhầm số lượng" maxLength={500} autoFocus />
      </Field>
      <FormFooter saving={saving} label="Đảo giao dịch" onCancel={onCancel} onSubmit={submit} error={error} danger />
    </View>
  )
}

function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.option, selected && styles.optionOn]}>
      {selected && <Icon name="check" size={16} color="#fff" />}
      <Text style={{ fontSize: font.small, fontWeight: '500', color: selected ? '#fff' : colors.ink }}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.warnSoft, padding: 16, paddingTop: 18 },
  code: { fontSize: font.caption, fontWeight: '700', color: colors.warn, backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  actions: { gap: 10, paddingHorizontal: 16, marginTop: 14 },
  outlineAmber: { flex: 1, borderColor: '#F0C98A', backgroundColor: '#fff' },
  hint: { fontSize: font.caption, color: colors.muted },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  reverseButton: { minWidth: 48, minHeight: 48, borderRadius: 12, backgroundColor: colors.warnSoft, alignItems: 'center', justifyContent: 'center' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: '90%' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -8, marginRight: -8 },
  formCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14 },
  label: { fontSize: font.small, fontWeight: '600', color: colors.ink },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, fontSize: font.body, color: colors.ink, backgroundColor: '#fff' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  optionOn: { backgroundColor: colors.warn, borderColor: colors.warn },
  reverseSummary: { backgroundColor: colors.bg, borderRadius: 12, padding: 12, gap: 2 },
})
