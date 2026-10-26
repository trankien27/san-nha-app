import { router, useLocalSearchParams, type Href } from 'expo-router'
import { useState } from 'react'
import { Alert, Platform, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { usePermissions } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { getSession, getSessionCost, recordPayment, reversePayment, setGuestPaid } from '@/lib/endpoints'
import { bangkokToday, formatVnd, formatWeekdayDate, newIdempotencyKey } from '@/lib/format'
import type { PlaySession, SessionCost, SessionDebt } from '@/lib/types'
import { useLoad } from '@/lib/useLoad'
import { Avatar, Banner, Button, Card, Chip, ErrorState, Icon, Loading, SectionTitle, styles as ui } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

const methods = ['Tiền mặt', 'Chuyển khoản'] as const

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n${message}`)) onConfirm(); return }
  Alert.alert(title, message, [{ text: 'Không', style: 'cancel' }, { text: 'Đồng ý', style: 'destructive', onPress: onConfirm }])
}

function shareText(session: PlaySession, cost: SessionCost, debts: SessionDebt[]) {
  const lines = debts.map((debt) => `${debt.paidAmount >= debt.amount ? '✓' : '•'} ${debt.name}: ${formatVnd(debt.amount)}${debt.paidAmount >= debt.amount ? ' (đã trả)' : ''}`)
  return [`Tiền ${session.title} · ${formatWeekdayDate(session.startsAtUtc)}`, `Tổng ${formatVnd(cost.totalAmount)}`, ...lines].join('\n')
}

/** Tiền từng người của buổi đã chốt: ghi đã thu cho thành viên (vào công nợ) hoặc đánh dấu khách đã trả. Tính, chốt và mở lại tiền ở màn Tính tiền. */
export default function SessionMoneyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const notify = useToast()
  const { canBill } = usePermissions()
  // Màn tính tiền mới chưa có trong typed routes sinh tự động (.expo/types) cho tới lần chạy expo start kế tiếp.
  const openBilling = () => router.push(`/buoi/${id}/tinh-tien` as Href)
  const [method, setMethod] = useState<(typeof methods)[number]>('Tiền mặt')
  const [busy, setBusy] = useState<number | null>(null)
  const { data, setData, error, loading, refreshing, reload } = useLoad(async () => {
    const [session, cost] = await Promise.all([getSession(id), getSessionCost(id)])
    return { session, cost }
  }, id)

  if (loading) return <Loading />
  if (error || !data) return <ErrorState message={error ?? 'Không tải được tiền buổi.'} onRetry={() => void reload()} />
  const { session, cost } = data
  const debts = cost.debts ?? []
  const exempt = cost.charges.filter((charge) => charge.isExempt)
  const due = cost.totalAmount - (cost.exemptAmount ?? 0)
  const percent = due > 0 ? Math.min(100, Math.round((cost.collectedAmount / due) * 100)) : 100
  const paidCount = debts.filter((debt) => debt.paidAmount >= debt.amount).length

  const run = async (debt: SessionDebt, action: () => Promise<SessionCost>, message: string) => {
    setBusy(debt.chargeId)
    try {
      setData({ session, cost: await action() })
      notify('success', message)
    } catch (actionError) {
      notify('error', errorMessage(actionError))
    } finally {
      setBusy(null)
    }
  }
  const markPaid = (debt: SessionDebt) => {
    const amount = debt.amount - debt.paidAmount
    void run(debt, async () => {
      if (debt.isGuest) return setGuestPaid(id, debt.chargeId, true)
      await recordPayment({ playerId: debt.playerId!, amount, paymentDate: bangkokToday(), method, idempotencyKey: newIdempotencyKey(`debt-${debt.receivableId}`), notes: `Tiền lịch đánh ${session.title}`, receivableId: debt.receivableId })
      return getSessionCost(id)
    }, `${debt.name} đã trả ${formatVnd(amount)}.`)
  }
  const undoPaid = (debt: SessionDebt) => confirmAction('Bỏ đánh dấu đã trả', `Bỏ đánh dấu ${debt.name} đã trả? Khoản trả sẽ được đảo lại và giữ trong lịch sử.`, () => void run(debt, async () => {
    if (debt.isGuest) return setGuestPaid(id, debt.chargeId, false)
    for (const paymentId of debt.paymentIds) await reversePayment(paymentId, `Bỏ đánh dấu đã trả tiền lịch đánh ${session.title}`)
    return getSessionCost(id)
  }, `Đã bỏ đánh dấu ${debt.name} đã trả.`))

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}>
      <View style={styles.header}>
        <Text style={{ color: colors.moneyLight, fontSize: font.small }}>{session.title} · {formatWeekdayDate(session.startsAtUtc)}</Text>
        <Text style={{ color: '#fff', fontSize: font.big, fontWeight: '700', marginTop: 4 }}>{formatVnd(cost.totalAmount)}</Text>
        {cost.isClosed ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
              <Text style={{ color: colors.brandLight, fontSize: font.small }}>Đã thu {formatVnd(cost.collectedAmount)}</Text>
              <Text style={{ color: cost.collectedAmount >= due ? colors.brandLight : '#F5C4B3', fontSize: font.small }}>{cost.collectedAmount >= due ? 'Đã đủ' : `Còn ${formatVnd(due - cost.collectedAmount)}`}</Text>
            </View>
            <View style={styles.track}><View style={[styles.fill, { width: `${percent}%` }]} /></View>
            <Text style={{ color: colors.moneyLight, fontSize: font.caption, marginTop: 6 }}>{paidCount}/{debts.length} người đã trả{exempt.length > 0 ? ` · ${exempt.length} người miễn thu` : ''}</Text>
          </>
        ) : <Text style={{ color: colors.moneyLight, fontSize: font.small, marginTop: 6 }}>Tạm tính, chưa chốt</Text>}
      </View>

      {!cost.isClosed ? (
        <View style={{ marginTop: 14 }}>
          <Banner tone="warn" icon="information-outline" text={canBill ? 'Buổi chưa chốt tiền. Bấm "Tính tiền" để nhập tiền sân, vật tư, số người rồi chốt; sau đó thu tiền từng người tại đây.' : 'Buổi chưa chốt tiền. Kế toán hoặc Quản trị sẽ tính và chốt tiền; sau đó thu tiền từng người tại đây.'} />
          {canBill && <View style={{ paddingHorizontal: 16, marginTop: 12 }}><Button label="Tính tiền / sửa bảng tiền" tone="money" icon="calculator-variant-outline" onPress={openBilling} /></View>}
          <SectionTitle>Các khoản</SectionTitle>
          <Card style={{ paddingVertical: 2 }}>
            {cost.lines.map((line) => (
              <View key={`${line.category}-${line.description}`} style={ui.row}>
                <Text style={[ui.rowTitle, { flex: 1 }]}>{line.description}</Text>
                <Text style={{ fontSize: font.body, color: colors.ink }}>{formatVnd(line.amount)}</Text>
              </View>
            ))}
          </Card>
        </View>
      ) : (
        <>
          <View style={styles.methodRow}>
            <Text style={{ fontSize: font.small, color: colors.muted }}>Thu bằng</Text>
            {methods.map((item) => (
              <Pressable key={item} onPress={() => setMethod(item)}>
                <Chip label={item} bg={method === item ? colors.money : '#fff'} fg={method === item ? '#fff' : colors.ink} style={{ paddingVertical: 6, borderWidth: 1, borderColor: method === item ? colors.money : colors.line }} />
              </Pressable>
            ))}
          </View>
          <SectionTitle>Tiền từng người</SectionTitle>
          <Card style={{ paddingVertical: 2 }}>
            {debts.map((debt) => {
              const paid = debt.paidAmount >= debt.amount
              return (
                <View key={debt.chargeId} style={ui.row}>
                  <Avatar name={debt.name} seed={debt.playerId ?? debt.name} />
                  <View style={{ flex: 1 }}>
                    <Text style={ui.rowTitle}>{debt.name}{debt.isGuest ? ' (khách)' : ''}</Text>
                    <Text style={ui.rowSub}>{formatVnd(debt.amount)}{!debt.isGuest && !paid && debt.paidAmount > 0 ? ` · đã trả ${formatVnd(debt.paidAmount)}` : ''}</Text>
                  </View>
                  {paid
                    ? <Pressable onPress={() => undoPaid(debt)} disabled={busy !== null}><Chip label="Đã trả" icon="check-circle-outline" bg={colors.okSoft} fg={colors.ok} style={{ paddingVertical: 6 }} /></Pressable>
                    : <Button label="Ghi đã thu" tone="money" busy={busy === debt.chargeId} disabled={busy !== null} onPress={() => markPaid(debt)} style={{ minHeight: 38, paddingHorizontal: 12 }} />}
                </View>
              )
            })}
            {exempt.map((charge) => (
              <View key={charge.id} style={ui.row}>
                <Avatar name={charge.name} seed={charge.playerId ?? charge.name} />
                <View style={{ flex: 1 }}>
                  <Text style={ui.rowTitle}>{charge.name}</Text>
                  <Text style={ui.rowSub}>{formatVnd(charge.amount)} · không ghi công nợ</Text>
                </View>
                <Chip label="Miễn thu" bg={colors.neutralSoft} fg={colors.neutral} />
              </View>
            ))}
          </Card>
          <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
            <Button label="Gửi danh sách vào nhóm" tone="outline" icon="share-variant-outline" onPress={() => void Share.share({ message: shareText(session, cost, debts) })} />
            {canBill && <Button label="Tính tiền / sửa bảng tiền" tone="outline" icon="calculator-variant-outline" onPress={openBilling} style={{ marginTop: 10 }} />}
            <Text style={{ fontSize: font.caption, color: colors.muted, textAlign: 'center', marginTop: 8 }}><Icon name="information-outline" size={12} color={colors.muted} /> Sửa tiền sân thực trả, ghi thu theo buổi hoặc mở lại bảng tiền (chỉ Quản trị) ở màn Tính tiền.</Text>
          </View>
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.money, padding: 16, paddingTop: 18 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.moneyMid, marginTop: 6 },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.brandLight },
  methodRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 14 },
})
