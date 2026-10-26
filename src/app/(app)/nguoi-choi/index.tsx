import { router, Stack, type Href } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { usePermissions } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { skillLabel } from '@/lib/format'
import { getPlayerPage, membershipLabels, playerStatusLabels, type PlayerDetail, type PlayerStatus } from '@/lib/services/admin'
import { useLoad } from '@/lib/useLoad'
import { Avatar, Button, Chip, EmptyState, ErrorState, Icon, Loading } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

// Cast vì danh sách route có kiểu (.expo/types) chỉ sinh lại khi chạy dev server.
const playerHref = (playerId: string) => ({ pathname: '/nguoi-choi/[playerId]', params: { playerId } }) as unknown as Href

const statusFilters: { value: PlayerStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'active', label: playerStatusLabels.active },
  { value: 'paused', label: playerStatusLabels.paused },
  { value: 'left', label: playerStatusLabels.left },
]
const statusChip: Record<PlayerStatus, [string, string]> = {
  active: [colors.okSoft, colors.ok],
  paused: [colors.warnSoft, colors.warn],
  left: [colors.neutralSoft, colors.neutral],
}

/** Danh sách hồ sơ người chơi (Quản trị, Hỗ trợ): tìm, lọc trạng thái, thêm mới. */
export default function PlayersScreen() {
  const { canManage } = usePermissions()
  const notify = useToast()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<PlayerStatus | ''>('')
  const [more, setMore] = useState<{ key: string; page: number; items: PlayerDetail[] } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const key = `${search}|${status}`

  // Tìm sau khi ngừng gõ một chút để không gọi API theo từng ký tự.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { data, error, loading, refreshing, reload } = useLoad(async () => (canManage ? getPlayerPage({ search, status }) : null), key)

  if (!canManage) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: 'Người chơi' }} />
        <EmptyState icon="lock-outline" title="Không có quyền quản lý người chơi" message="Chỉ Quản trị và Hỗ trợ được xem và sửa hồ sơ người chơi." />
      </View>
    )
  }

  const extra = more && more.key === key ? more : null
  const items = data ? [...data.items, ...(extra?.items ?? [])] : []
  const lastPage = extra?.page ?? data?.page ?? 1
  const hasMore = data ? lastPage < data.totalPages : false

  const refresh = () => { setMore(null); void reload() }
  const loadMore = async () => {
    if (!data || !hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      const next = await getPlayerPage({ search, status, page: lastPage + 1 })
      setMore({ key, page: next.page, items: [...(extra?.items ?? []), ...next.items] })
    } catch (loadError) {
      notify('error', errorMessage(loadError, 'Không tải thêm được người chơi.'))
    } finally {
      setLoadingMore(false)
    }
  }

  const header = (
    <View style={{ gap: 10, paddingTop: 12, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16 }}>
        <View style={styles.searchBox}>
          <Icon name="magnify" color={colors.muted} />
          <TextInput value={searchInput} onChangeText={setSearchInput} placeholder="Tên, mã, số điện thoại…" placeholderTextColor={colors.muted} style={styles.searchInput} returnKeyType="search" maxLength={100} />
          {searchInput !== '' && <Pressable accessibilityLabel="Xóa từ khóa" hitSlop={10} onPress={() => setSearchInput('')}><Icon name="close-circle" size={18} color={colors.muted} /></Pressable>}
        </View>
        <Button label="Thêm" icon="account-plus-outline" onPress={() => router.push(playerHref('moi'))} style={{ paddingHorizontal: 14 }} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {statusFilters.map((filter) => {
          const on = status === filter.value
          return (
            <Pressable key={filter.value || 'all'} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setStatus(filter.value)} style={[styles.filter, on && styles.filterOn]}>
              <Text style={{ fontSize: font.small, color: on ? '#fff' : colors.ink, fontWeight: on ? '600' : '400' }}>{filter.label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
      {data && <Text style={{ fontSize: font.caption, color: colors.muted, marginHorizontal: 16 }}>{data.totalItems} hồ sơ</Text>}
    </View>
  )

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Người chơi' }} />
      {loading ? <>{header}<Loading /></>
        : error || !data ? <>{header}<ErrorState message={error ?? 'Không tải được người chơi.'} onRetry={refresh} /></>
          : (
            <FlatList
              data={items}
              keyExtractor={(player) => player.id}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={header}
              contentContainerStyle={{ paddingBottom: 32 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
              onEndReachedThreshold={0.4}
              onEndReached={() => void loadMore()}
              ListEmptyComponent={<EmptyState icon="account-group-outline" title={search || status ? 'Không có người chơi phù hợp' : 'Chưa có người chơi'} message={search || status ? 'Thử đổi từ khóa hoặc bộ lọc.' : 'Thêm người chơi đầu tiên để chọn vào lịch đánh, chia trận và chia tiền.'} />}
              ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.brand} style={{ margin: 16 }} /> : undefined}
              renderItem={({ item }) => <PlayerRow player={item} />}
            />
          )}
    </View>
  )
}

function PlayerRow({ player }: { player: PlayerDetail }) {
  const [bg, fg] = statusChip[player.status]
  return (
    <Pressable onPress={() => router.push(playerHref(player.id))} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.85 : 1 }]}>
      <Avatar name={player.fullName} seed={player.id} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.body, color: colors.ink }} numberOfLines={1}>{player.fullName}</Text>
        <Text style={{ fontSize: font.caption, color: colors.muted }} numberOfLines={1}>
          {player.memberCode} · {skillLabel(player.effectiveSkillRating)} · {membershipLabels[player.membershipType]}
        </Text>
        {(player.phoneNumber || player.email) && <Text style={{ fontSize: font.caption, color: colors.muted }} numberOfLines={1}>{player.phoneNumber || player.email}</Text>}
      </View>
      <Chip label={playerStatusLabels[player.status]} bg={bg} fg={fg} />
      <Icon name="chevron-right" color={colors.muted} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12 },
  searchInput: { flex: 1, minHeight: 44, fontSize: font.body, color: colors.ink },
  filter: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
  filterOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 11, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
})
