import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { ComponentProps, ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { initials } from '@/lib/format'
import { avatarColors, colors, font } from './theme'

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name']

export function Icon({ name, size = 20, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />
}

export function Avatar({ name, size = 34, seed }: { name: string; size?: number; seed?: string }) {
  const [bg, fg] = avatarColors(seed ?? name)
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontSize: size * 0.36, fontWeight: '600' }}>{initials(name)}</Text>
    </View>
  )
}

export function Chip({ label, bg, fg, icon, style }: { label: string; bg: string; fg: string; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }, style]}>
      {icon && <Icon name={icon} size={13} color={fg} />}
      <Text style={{ color: fg, fontSize: font.caption, fontWeight: '500' }}>{label}</Text>
    </View>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>
}

type ButtonTone = 'brand' | 'money' | 'outline' | 'danger'
export function Button({ label, onPress, tone = 'brand', icon, busy, disabled, style }: { label: string; onPress: () => void; tone?: ButtonTone; icon?: IconName; busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const palette = {
    brand: { bg: colors.brand, fg: '#fff', border: colors.brand },
    money: { bg: colors.money, fg: '#fff', border: colors.money },
    outline: { bg: '#fff', fg: colors.brand, border: colors.brandLight },
    danger: { bg: '#fff', fg: colors.danger, border: '#F7C1C1' },
  }[tone]
  const inactive = disabled || busy
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [styles.button, { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.55 : pressed ? 0.85 : 1 }, style]}
    >
      {busy ? <ActivityIndicator size="small" color={palette.fg} /> : icon ? <Icon name={icon} size={18} color={palette.fg} /> : null}
      <Text style={{ color: palette.fg, fontSize: font.body, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
}

export function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.brand} />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.state}>
      <Icon name="wifi-alert" size={30} color={colors.danger} />
      <Text style={[styles.stateTitle, { color: colors.danger }]}>Chưa tải được dữ liệu</Text>
      <Text style={styles.stateText}>{message}</Text>
      <Button label="Thử lại" tone="outline" icon="refresh" onPress={onRetry} style={{ marginTop: 8 }} />
    </View>
  )
}

export function EmptyState({ icon, title, message }: { icon: IconName; title: string; message?: string }) {
  return (
    <View style={styles.state}>
      <Icon name={icon} size={30} color={colors.muted} />
      <Text style={styles.stateTitle}>{title}</Text>
      {message && <Text style={styles.stateText}>{message}</Text>}
    </View>
  )
}

export function Banner({ tone, icon, text }: { tone: 'ok' | 'warn' | 'danger'; icon: IconName; text: string }) {
  const palette = { ok: [colors.okSoft, colors.ok], warn: [colors.warnSoft, colors.warnDark], danger: [colors.dangerSoft, colors.danger] }[tone]
  return (
    <View style={[styles.banner, { backgroundColor: palette[0] }]}>
      <Icon name={icon} size={16} color={palette[1]} />
      <Text style={{ color: palette[1], fontSize: font.small, flex: 1 }}>{text}</Text>
    </View>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>
}

export const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 14, marginHorizontal: 16 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1 },
  state: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 6 },
  stateTitle: { fontSize: font.body, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  stateText: { fontSize: font.small, color: colors.muted, textAlign: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, marginHorizontal: 16 },
  section: { fontSize: font.body, fontWeight: '600', color: colors.ink, marginHorizontal: 16, marginTop: 18, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowTitle: { fontSize: font.body, color: colors.ink },
  rowSub: { fontSize: font.caption, color: colors.muted, marginTop: 2 },
})
