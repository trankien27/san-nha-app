import { router, Stack, type Href } from 'expo-router'
import { useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { useAuth } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { formatVnd } from '@/lib/format'
import { formatQuantity, getInventory, type InventoryItem } from '@/lib/services/inventory'
import { useLoad } from '@/lib/useLoad'
import { Banner, Button, Chip, EmptyState, ErrorState, Icon, Loading } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

// Cast vì danh sách route có kiểu (.expo/types) chỉ sinh lại khi chạy dev server.
const itemHref = (item: Pick<InventoryItem, 'id' | 'code'>) => ({ pathname: '/vat-tu/[itemId]', params: { itemId: item.id, code: item.code } }) as unknown as Href
const newItemHref = { pathname: '/vat-tu/[itemId]', params: { itemId: 'moi' } } as unknown as Href

/** Kho vật tư: Quản trị, Kế toán xem tồn và quản lý; vai trò khác không có quyền (server chỉ cho ADMIN/TREASURER). */
export default function InventoryListScreen() {
  const roles = useAuth().user?.roles ?? []
  const canManage = roles.includes('ADMIN') || roles.includes('TREASURER')
  const notify = useToast()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [lowStock, setLowStock] = useState(false)
  const [more, setMore] = useState<{ key: string; page: number; items: InventoryItem[] } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const key = `${search}|${lowStock}`

  // Tìm sau khi ngừng gõ một chút để không gọi API theo từng ký tự.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { data, error, loading, refreshing, reload } = useLoad(async () => (canManage ? getInventory({ search, lowStock }) : null), key)

  if (!canManage) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: 'Vật tư' }} />
        <EmptyState icon="lock-outline" title="Không có quyền xem kho" message="Chỉ Quản trị và Kế toán được xem và quản lý vật tư." />
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
      const next = await getInventory({ search, lowStock, page: lastPage + 1 })
      setMore({ key, page: next.page, items: [...(extra?.items ?? []), ...next.items] })
    } catch (loadError) {
      notify('error', errorMessage(loadError, 'Không tải thêm được vật tư.'))
    } finally {
      setLoadingMore(false)
    }
  }

  const header = (
    <View style={{ gap: 10, paddingTop: 12, paddingBottom: 8 }}>
      <View style={styles.searchBox}>
        <Icon name="magnify" color={colors.muted} />
        <TextInput value={searchInput} onChangeText={setSearchInput} onSubmitEditing={() => setSearch(searchInput.trim())} returnKeyType="search" placeholder="Mã, tên hoặc nhóm vật tư" placeholderTextColor={colors.muted} style={styles.searchInput} autoCorrect={false} />
        {searchInput !== '' && <Pressable accessibilityLabel="Xóa tìm kiếm" hitSlop={12} onPress={() => { setSearchInput(''); setSearch('') }}><Icon name="close-circle" color={colors.muted} size={18} /></Pressable>}
      </View>
      <View style={styles.toolbar}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: lowStock }} onPress={() => setLowStock((value) => !value)} style={styles.filter}>
          <Chip label="Chỉ sắp hết" icon={lowStock ? 'check' : 'alert-outline'} bg={lowStock ? colors.warn : '#fff'} fg={lowStock ? '#fff' : colors.warn} style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: lowStock ? colors.warn : colors.line }} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: font.small, color: colors.muted }} numberOfLines={1}>{data ? `${data.totalItems} mặt hàng` : ''}</Text>
        <Button label="Thêm" icon="plus" onPress={() => router.push(newItemHref)} style={{ backgroundColor: colors.warn, borderColor: colors.warn, paddingHorizontal: 14 }} />
      </View>
      <Banner tone="warn" icon="information-outline" text="Số tồn chỉ đổi qua giao dịch kho; vật tư dùng cho lịch đánh được ghi khi tính tiền buổi." />
    </View>
  )

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Vật tư' }} />
      <FlatList
        data={loading || error ? [] : items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={header}
        ListEmptyComponent={loading ? <Loading label="Đang tải kho…" /> : error ? <ErrorState message={error} onRetry={refresh} /> : (
          <EmptyState icon="package-variant" title={search || lowStock ? 'Không có vật tư phù hợp' : 'Chưa có vật tư'} message={search || lowStock ? 'Thử đổi từ khóa hoặc bỏ lọc sắp hết.' : 'Thêm cầu, nước và vật tư vận hành để bắt đầu theo dõi tồn.'} />
        )}
        onEndReachedThreshold={0.4}
        onEndReached={() => void loadMore()}
        ListFooterComponent={loadingMore ? <Loading label="Đang tải thêm…" /> : undefined}
        renderItem={({ item }) => <ItemRow item={item} />}
      />
    </View>
  )
}

function ItemRow({ item }: { item: InventoryItem }) {
  return (
    <Pressable onPress={() => router.push(itemHref(item))} style={({ pressed }) => [styles.row, item.isLowStock && styles.rowLow, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.icon, { backgroundColor: item.isLowStock ? colors.warnSoft : colors.neutralSoft }]}>
        <Icon name={item.isLowStock ? 'alert-outline' : 'package-variant-closed'} size={22} color={item.isLowStock ? colors.warn : colors.neutral} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: font.body, fontWeight: '600', color: item.isActive ? colors.ink : colors.muted, flexShrink: 1 }} numberOfLines={1}>{item.name}</Text>
          {!item.isActive && <Chip label="Ngừng dùng" bg={colors.neutralSoft} fg={colors.neutral} style={{ paddingVertical: 2, paddingHorizontal: 8 }} />}
        </View>
        <Text style={{ fontSize: font.caption, color: colors.muted }} numberOfLines={1}>{item.code} · {item.category} · tối thiểu {formatQuantity(item.minimumStock)} {item.unit}</Text>
        <Text style={{ fontSize: font.caption, color: colors.muted }} numberOfLines={1}>Nhập {formatVnd(item.averageCost)} · Xuất {formatVnd(item.effectiveSalePrice)} /{item.unit}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: font.title, fontWeight: '700', color: item.isLowStock ? colors.warn : colors.ink }}>{formatQuantity(item.stockOnHand)}</Text>
        <Text style={{ fontSize: font.caption, color: item.isLowStock ? colors.warn : colors.muted }}>{item.isLowStock ? `${item.unit} · sắp hết` : item.unit}</Text>
      </View>
      <Icon name="chevron-right" color={colors.muted} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, marginHorizontal: 16 },
  searchInput: { flex: 1, minHeight: 44, fontSize: font.body, color: colors.ink },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16 },
  filter: { minHeight: 44, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowLow: { backgroundColor: '#FFFBF3', borderLeftWidth: 3, borderLeftColor: colors.warn, paddingLeft: 13 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
})
