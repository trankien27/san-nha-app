import { router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { formatTime, formatVnd, formatWeekdayDate } from '@/lib/format'
import type { PlaySession, PlaySessionStatus } from '@/lib/types'
import { Chip, Icon, styles as ui } from './components'
import { colors, font } from './theme'

export const statusMeta: Record<PlaySessionStatus, { label: string; bg: string; fg: string }> = {
  draft: { label: 'Nháp', bg: colors.neutralSoft, fg: colors.neutral },
  open: { label: 'Mở đăng ký', bg: colors.brandSoft, fg: colors.brand },
  full: { label: 'Đã đủ người', bg: colors.warnSoft, fg: colors.warnDark },
  completed: { label: 'Chờ tính tiền', bg: colors.moneySoft, fg: colors.money },
  costClosed: { label: 'Đã chốt tiền', bg: colors.okSoft, fg: colors.ok },
  cancelled: { label: 'Đã hủy', bg: colors.dangerSoft, fg: colors.danger },
}

/** Đường dẫn các màn con của một buổi. */
export const screenPath = { 'diem-danh': '/buoi/[id]/diem-danh', 'chia-tran': '/buoi/[id]/chia-tran', tien: '/buoi/[id]/tien' } as const
export type SessionScreen = keyof typeof screenPath

export const courtNames = (session: PlaySession) => session.courts.map((court) => court.name).join(', ') || `${session.courtCount} sân`

/** Thẻ một lịch đánh trong danh sách; showMoney hiện tiến độ thu tiền khi buổi đã chốt. */
export function SessionCard({ session, showMoney = false }: { session: PlaySession; showMoney?: boolean }) {
  const meta = statusMeta[session.status]
  const due = session.amountDue
  return (
    <Pressable onPress={() => router.push({ pathname: '/buoi/[id]', params: { id: session.id } })} style={({ pressed }) => [ui.card, { marginBottom: 10, opacity: pressed ? 0.85 : 1 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: font.caption, color: colors.muted }}>{formatWeekdayDate(session.startsAtUtc)}</Text>
        <Chip label={meta.label} bg={meta.bg} fg={meta.fg} />
      </View>
      <Text style={{ fontSize: font.body, fontWeight: '600', color: colors.ink, marginTop: 6 }}>{formatTime(session.startsAtUtc)} – {formatTime(session.endsAtUtc)} · {session.title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
        <Icon name="map-marker-outline" size={14} color={colors.muted} />
        <Text style={{ fontSize: font.caption, color: colors.muted, flex: 1 }} numberOfLines={1}>{session.venueName} · {courtNames(session)}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
        <Text style={{ fontSize: font.small, color: colors.ink }}><Icon name="account-group-outline" size={14} color={colors.muted} /> {session.registeredCount}/{session.maxParticipants} đăng ký{session.waitlistedCount > 0 ? ` · ${session.waitlistedCount} chờ` : ''}</Text>
        {showMoney && due !== null && (
          <Text style={{ fontSize: font.small, color: session.collectedAmount >= due ? colors.ok : colors.liveDark }}>
            {session.collectedAmount >= due ? 'Đã thu đủ' : `Còn ${formatVnd(due - session.collectedAmount)}`}
          </Text>
        )}
      </View>
    </Pressable>
  )
}
