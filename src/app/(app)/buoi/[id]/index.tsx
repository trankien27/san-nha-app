import { router, Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { usePermissions } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { cancelMe, getRoster, getSession, registerMe } from '@/lib/endpoints'
import { formatTime, formatVnd, formatWeekdayDate } from '@/lib/format'
import { useLoad } from '@/lib/useLoad'
import { Avatar, Banner, Button, Card, Chip, ErrorState, Icon, Loading, SectionTitle, styles as ui, type IconName } from '@/ui/components'
import { courtNames, screenPath, statusMeta, type SessionScreen } from '@/ui/SessionCard'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { canManage, canBill } = usePermissions()
  const notify = useToast()
  const [busy, setBusy] = useState(false)
  const { data, setData, error, loading, refreshing, reload } = useLoad(async () => {
    const [session, roster] = await Promise.all([getSession(id), getRoster(id)])
    return { session, roster }
  }, id)

  if (loading) return <Loading />
  if (error || !data) return <ErrorState message={error ?? 'Không tìm thấy lịch đánh.'} onRetry={() => void reload()} />
  const { session, roster } = data
  const meta = statusMeta[session.status]
  const mine = roster.currentUserRegistration
  const go = (screen: SessionScreen) => router.push({ pathname: screenPath[screen], params: { id } })
  const atCourt = session.status !== 'cancelled' && session.status !== 'draft'
  // Backend chỉ cho sửa lịch ở trạng thái nháp / mở đăng ký / đủ người.
  const editable = session.status === 'draft' || session.status === 'open' || session.status === 'full'

  const toggleRegistration = async () => {
    setBusy(true)
    try {
      const next = roster.canCurrentUserCancel ? await cancelMe(id) : await registerMe(id)
      setData({ session: await getSession(id), roster: next })
      const status = next.currentUserRegistration?.status
      notify('success', status === 'waitlisted' ? `Đã vào danh sách chờ (vị trí ${next.currentUserRegistration?.waitlistPosition ?? '?'}).` : status === 'cancelled' || !status ? 'Đã hủy đăng ký.' : 'Đã đăng ký buổi này.')
    } catch (actionError) {
      notify('error', errorMessage(actionError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}>
      <Stack.Screen options={{ title: session.title }} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: font.small, color: colors.muted }}>{formatWeekdayDate(session.startsAtUtc)}</Text>
          <Chip label={meta.label} bg={meta.bg} fg={meta.fg} />
        </View>
        <Text style={{ fontSize: font.big, fontWeight: '700', color: colors.ink, marginTop: 6 }}>{formatTime(session.startsAtUtc)} – {formatTime(session.endsAtUtc)}</Text>
        <Info icon="map-marker-outline" text={`${session.venueName} · ${session.venueAddress}`} onPress={session.venueMapUrl ? () => void Linking.openURL(session.venueMapUrl!) : undefined} />
        <Info icon="badminton" text={`${courtNames(session)} · ${session.courtCount} sân đánh cùng lúc`} />
        <Info icon="account-tie-outline" text={`Phụ trách: ${session.organizerName}`} />
        <Info icon="clock-alert-outline" text={`Hạn đăng ký: ${formatWeekdayDate(session.registrationDeadlineUtc)} ${formatTime(session.registrationDeadlineUtc)}`} />
        {session.notes ? <Text style={{ fontSize: font.small, color: colors.ink, marginTop: 8 }}>{session.notes}</Text> : null}
        {canBill && session.amountDue !== null && <Text style={{ fontSize: font.small, color: colors.money, marginTop: 8 }}>Đã thu {formatVnd(session.collectedAmount)} / {formatVnd(session.amountDue)}</Text>}
      </Card>

      {session.status === 'cancelled' && <View style={{ marginTop: 12 }}><Banner tone="danger" icon="cancel" text={`Buổi đã hủy${session.cancellationReason ? `: ${session.cancellationReason}` : ''}.`} /></View>}

      {(roster.canCurrentUserRegister || roster.canCurrentUserCancel) && (
        <View style={{ paddingHorizontal: 16, marginTop: 12, gap: 6 }}>
          {mine && mine.status === 'waitlisted' && <Banner tone="warn" icon="timer-sand" text={`Bạn đang ở vị trí ${mine.waitlistPosition ?? '?'} trong danh sách chờ.`} />}
          <Button label={roster.canCurrentUserCancel ? 'Hủy đăng ký' : roster.remainingSlots > 0 ? 'Đăng ký buổi này' : 'Vào danh sách chờ'} tone={roster.canCurrentUserCancel ? 'danger' : 'brand'} icon={roster.canCurrentUserCancel ? 'account-remove-outline' : 'account-plus-outline'} busy={busy} onPress={() => void toggleRegistration()} />
        </View>
      )}

      {atCourt && (canManage || canBill) && (
        <>
          <SectionTitle>Việc tại sân</SectionTitle>
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16 }}>
            <Tile icon="clipboard-check-outline" label="Điểm danh" bg={colors.brandSoft} fg={colors.brandMid} onPress={() => go('diem-danh')} />
            {canManage && <Tile icon="sword-cross" label="Chia trận" bg={colors.liveSoft} fg="#993C1D" onPress={() => go('chia-tran')} />}
            {canBill && <Tile icon="calculator-variant-outline" label="Tiền buổi" bg={colors.moneySoft} fg={colors.moneyMid} onPress={() => go('tien')} />}
          </View>
        </>
      )}

      {canManage && (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 14 }}>
          {editable && <Button label="Sửa lịch" tone="outline" icon="pencil-outline" onPress={() => router.push({ pathname: '/lich-danh/form', params: { id } })} style={{ flex: 1 }} />}
          <Button label="Sao chép" tone="outline" icon="content-copy" onPress={() => router.push({ pathname: '/lich-danh/form', params: { copyFrom: id } })} style={{ flex: 1 }} />
        </View>
      )}

      <SectionTitle>Đăng ký {roster.registeredCount}/{roster.capacity}{roster.waitlistedCount > 0 ? ` · ${roster.waitlistedCount} chờ` : ''}</SectionTitle>
      {canManage && session.status !== 'cancelled' && (
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <Button label="Quản lý đăng ký" tone="outline" icon="account-multiple-plus-outline" onPress={() => router.push({ pathname: '/buoi/[id]/dang-ky', params: { id } })} />
        </View>
      )}
      <Card style={{ paddingVertical: 2 }}>
        {roster.registered.length === 0 && roster.waitlisted.length === 0
          ? <Text style={[ui.rowSub, { paddingVertical: 14, textAlign: 'center' }]}>Chưa có ai đăng ký.</Text>
          : [...roster.registered, ...roster.waitlisted].map((row) => (
            <View key={row.id} style={ui.row}>
              <Avatar name={row.playerName} seed={row.playerId} size={32} />
              <Text style={[ui.rowTitle, { flex: 1 }]}>{row.playerName}{row.isCurrentUser ? ' (bạn)' : ''}</Text>
              {row.status === 'waitlisted'
                ? <Chip label={`Chờ #${row.waitlistPosition ?? '?'}`} bg={colors.warnSoft} fg={colors.warnDark} />
                : row.status === 'promoted' ? <Chip label="Được đôn lên" bg={colors.brandSoft} fg={colors.brand} /> : null}
            </View>
          ))}
      </Card>
    </ScrollView>
  )
}

function Info({ icon, text, onPress }: { icon: IconName; text: string; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={{ flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'flex-start' }}>
      <Icon name={icon} size={16} color={colors.muted} />
      <Text style={{ fontSize: font.small, color: onPress ? colors.brandMid : colors.ink, flex: 1 }}>{text}</Text>
    </Pressable>
  )
}

function Tile({ icon, label, bg, fg, onPress }: { icon: IconName; label: string; bg: string; fg: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 12, alignItems: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ backgroundColor: bg, borderRadius: 14, padding: 10 }}><Icon name={icon} size={24} color={fg} /></View>
      <Text style={{ fontSize: font.small, fontWeight: '600', color: colors.ink }}>{label}</Text>
    </Pressable>
  )
}
