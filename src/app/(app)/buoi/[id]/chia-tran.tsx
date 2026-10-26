import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, FlatList, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { errorMessage } from '@/lib/api'
import { assignCourts, cancelGame, finishGame, getGameBoard, getSession, setCourtCount, startGames, suggestRound } from '@/lib/endpoints'
import { courtLetter, minutesSince, skillLabel } from '@/lib/format'
import type { GamePlayer, SessionGame, SessionGameBoard } from '@/lib/types'
import { useLoad } from '@/lib/useLoad'
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Icon, Loading, SectionTitle } from '@/ui/components'
import { colors, font } from '@/ui/theme'
import { useToast } from '@/ui/toast'

type Format = 'singles' | 'doubles'
interface Setup { format: Format; slots: (string | null)[] }
const emptySetup = (format: Format): Setup => ({ format, slots: Array(format === 'singles' ? 2 : 4).fill(null) })

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n${message}`)) onConfirm(); return }
  Alert.alert(title, message, [{ text: 'Không', style: 'cancel' }, { text: 'Đồng ý', style: 'destructive', onPress: onConfirm }])
}

/** Chia trận theo sân: sân đang đánh nhập tỉ số và kết thúc; sân trống chọn người (hoặc gợi ý) rồi bắt đầu. */
export default function GamesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const notify = useToast()
  const [board, setBoard] = useState<SessionGameBoard | null>(null)
  const [courts, setCourts] = useState(1)
  const [setups, setSetups] = useState<Record<number, Setup>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [picker, setPicker] = useState<{ courtNo: number; slot: number } | null>(null)
  const [showGroups, setShowGroups] = useState(false)
  const [, setTick] = useState(0)

  const { data, error, loading, refreshing, reload } = useLoad(async () => {
    const [session, nextBoard] = await Promise.all([getSession(id), getGameBoard(id)])
    setBoard(nextBoard)
    setCourts(session.courtCount || nextBoard.suggestedCourtCount || 1)
    return session
  }, id)

  // Đồng hồ số phút của các trận đang đánh.
  useEffect(() => { const timer = setInterval(() => setTick((value) => value + 1), 30000); return () => clearInterval(timer) }, [])

  if (loading) return <Loading />
  if (error || !data || !board) return <ErrorState message={error ?? 'Không tải được bảng trận.'} onRetry={() => void reload()} />

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    try { await action() } catch (actionError) { notify('error', errorMessage(actionError)) } finally { setBusy(null) }
  }
  const playing = board.games.filter((game) => game.status === 'planned')
  const finished = board.games.filter((game) => game.status === 'finished').sort((a, b) => (b.finishedAtUtc ?? '').localeCompare(a.finishedAtUtc ?? ''))
  const chosen = new Set(Object.values(setups).flatMap((setup) => setup.slots.filter((slot): slot is string => Boolean(slot))))
  const byId = new Map(board.players.map((player) => [player.attendanceId, player]))
  const setupFor = (courtNo: number) => setups[courtNo] ?? emptySetup('doubles')
  const updateSetup = (courtNo: number, setup: Setup) => setSetups((current) => ({ ...current, [courtNo]: setup }))

  const changeCourts = (next: number) => run('courts', async () => {
    if (next < 1 || next > 20) return
    setBoard(await setCourtCount(id, next))
    setCourts(next)
    setSetups((current) => Object.fromEntries(Object.entries(current).filter(([courtNo]) => Number(courtNo) <= next)))
  })

  const start = (courtNo: number) => run(`start-${courtNo}`, async () => {
    const setup = setupFor(courtNo)
    if (setup.slots.some((slot) => !slot)) throw new Error(`Chọn đủ ${setup.slots.length} người cho sân ${courtLetter(courtNo)}.`)
    const half = setup.slots.length / 2
    setBoard(await startGames(id, [{ courtNo, teamA: setup.slots.slice(0, half) as string[], teamB: setup.slots.slice(half) as string[] }]))
    setSetups((current) => { const next = { ...current }; delete next[courtNo]; return next })
    notify('success', `Đã bắt đầu trận ở sân ${courtLetter(courtNo)}.`)
  })

  const suggest = (courtNo: number) => run(`suggest-${courtNo}`, async () => {
    const result = await suggestRound(id, Math.max(courts, courtNo))
    const game = result.games.find((item) => item.courtNo === courtNo)
    if (!game) throw new Error(`Không đủ 4 người rảnh để gợi ý cho sân ${courtLetter(courtNo)}.`)
    updateSetup(courtNo, { format: 'doubles', slots: [...game.teamA, ...game.teamB] })
  })

  /** Chạm chữ cái sân: xếp người vào nhóm sân đó; chạm lại chữ đang chọn để bỏ xếp. */
  const assignOne = (player: GamePlayer, courtNo: number) => run(`assign-${player.attendanceId}`, async () => {
    setBoard(await assignCourts(id, [{ attendanceId: player.attendanceId, courtNo: player.courtNo === courtNo ? null : courtNo }]))
  })

  /** Chia đều mọi người vào các sân theo trình độ (kiểu rắn bò A B C C B A…) để các sân cân nhau. */
  const distribute = () => confirmAction('Chia đều người vào sân', `Xếp lại ${board.players.length} người vào ${courts} sân theo trình độ? Cách xếp hiện tại sẽ bị thay.`, () => void run('distribute', async () => {
    const ordered = [...board.players].sort((a, b) => b.skillRating - a.skillRating || a.name.localeCompare(b.name, 'vi'))
    const assignments = ordered.map((player, index) => {
      const round = Math.floor(index / courts); const position = index % courts
      return { attendanceId: player.attendanceId, courtNo: round % 2 === 0 ? position + 1 : courts - position }
    })
    setBoard(await assignCourts(id, assignments))
    setShowGroups(true)
    notify('success', `Đã chia ${assignments.length} người vào ${courts} sân.`)
  }))

  const clearGroups = () => confirmAction('Bỏ chia sân', 'Đưa mọi người về chưa xếp sân?', () => void run('distribute', async () => {
    setBoard(await assignCourts(id, board.players.map((player) => ({ attendanceId: player.attendanceId, courtNo: null }))))
  }))

  /** Chạm tên trong hàng chờ của sân: điền vào ô trống đầu tiên của sân đó. */
  const fillFromQueue = (courtNo: number, attendanceId: string) => {
    const setup = setupFor(courtNo)
    const index = setup.slots.findIndex((slot) => !slot)
    if (index < 0) { notify('error', `Sân ${courtLetter(courtNo)} đã đủ người.`); return }
    const slots = [...setup.slots]; slots[index] = attendanceId
    updateSetup(courtNo, { ...setup, slots })
  }
  // Hàng chờ của sân: người rảnh thuộc nhóm sân, ai đánh ít trận hơn đứng trước.
  const queueFor = (courtNo: number) => board.players
    .filter((player) => player.courtNo === courtNo && !player.isPlaying && !chosen.has(player.attendanceId))
    .sort((a, b) => a.gamesPlayed - b.gamesPlayed || a.name.localeCompare(b.name, 'vi'))
  const grouped = board.players.filter((player) => player.courtNo !== null && player.courtNo <= courts).length

  const pickerCourt = picker?.courtNo ?? 0
  const pickerSetup = picker ? setupFor(picker.courtNo) : null
  const candidates = board.players
    .filter((player) => !player.isPlaying && (!chosen.has(player.attendanceId) || pickerSetup?.slots[picker!.slot] === player.attendanceId))
    .sort((a, b) => Number(b.courtNo === pickerCourt) - Number(a.courtNo === pickerCourt) || a.gamesPlayed - b.gamesPlayed || a.name.localeCompare(b.name, 'vi'))

  const choose = (attendanceId: string | null) => {
    if (!picker || !pickerSetup) return
    const slots = [...pickerSetup.slots]
    slots[picker.slot] = attendanceId
    updateSetup(picker.courtNo, { ...pickerSetup, slots })
    const nextEmpty = slots.findIndex((slot) => !slot)
    setPicker(attendanceId && nextEmpty >= 0 ? { courtNo: picker.courtNo, slot: nextEmpty } : null)
  }

  const free = board.players.filter((player) => !player.isPlaying)
  return (
    <>
      <ScrollView contentContainerStyle={{ paddingVertical: 12, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} />}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.body, fontWeight: '600', color: colors.ink }}>{board.players.length} người có mặt</Text>
            <Text style={{ fontSize: font.caption, color: colors.muted }}>{playing.length} sân đang đánh · {free.length} người rảnh · {finished.length} trận xong</Text>
          </View>
          <Pressable accessibilityLabel="Bớt sân" disabled={busy === 'courts' || courts <= 1} onPress={() => void changeCourts(courts - 1)} style={styles.stepper}><Icon name="minus" color={colors.brand} /></Pressable>
          <Text style={{ fontSize: font.body, fontWeight: '700', minWidth: 48, textAlign: 'center' }}>{courts} sân</Text>
          <Pressable accessibilityLabel="Thêm sân" disabled={busy === 'courts' || courts >= 20} onPress={() => void changeCourts(courts + 1)} style={styles.stepper}><Icon name="plus" color={colors.brand} /></Pressable>
        </Card>

        {board.players.length === 0 && <EmptyState icon="clipboard-check-outline" title="Chưa có ai có mặt" message="Điểm danh trước rồi mới chia trận." />}

        {board.players.length > 0 && (
          <Card style={{ gap: 10 }}>
            <Pressable onPress={() => setShowGroups((value) => !value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="account-group-outline" color={colors.brandMid} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.body, fontWeight: '600', color: colors.ink }}>Chia người theo sân</Text>
                <Text style={{ fontSize: font.caption, color: colors.muted }}>{grouped > 0 ? `${grouped}/${board.players.length} người đã xếp sân` : 'Chưa xếp: mọi sân dùng chung một hàng chờ'}</Text>
              </View>
              <Icon name={showGroups ? 'chevron-up' : 'chevron-down'} color={colors.muted} />
            </Pressable>
            {showGroups && (
              <>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button label="Chia đều theo trình độ" tone="outline" icon="scale-balance" busy={busy === 'distribute'} disabled={busy !== null || courts < 2} onPress={distribute} style={{ flex: 1, minHeight: 40 }} />
                  {grouped > 0 && <Button label="Bỏ chia" tone="danger" disabled={busy !== null} onPress={clearGroups} style={{ minHeight: 40 }} />}
                </View>
                {[...board.players].sort((a, b) => (a.courtNo ?? 99) - (b.courtNo ?? 99) || a.name.localeCompare(b.name, 'vi')).map((player) => (
                  <View key={player.attendanceId} style={styles.groupRow}>
                    <Avatar name={player.name} seed={player.attendanceId} size={30} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: font.small, color: colors.ink }} numberOfLines={1}>{player.name}{player.isGuest ? ' (khách)' : ''}</Text>
                      <Text style={{ fontSize: font.caption, color: colors.muted }}>{skillLabel(player.skillRating)} · {player.gamesPlayed} trận{player.isPlaying ? ' · đang đánh' : ''}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4, maxWidth: 170 }}>
                      {Array.from({ length: courts }, (_, index) => index + 1).map((courtNo) => {
                        const on = player.courtNo === courtNo
                        return (
                          <Pressable key={courtNo} accessibilityLabel={`${on ? 'Bỏ' : 'Xếp'} ${player.name} ${on ? 'khỏi' : 'vào'} sân ${courtLetter(courtNo)}`} disabled={busy !== null} onPress={() => void assignOne(player, courtNo)} style={[styles.letter, on && styles.letterOn]}>
                            <Text style={{ fontSize: font.small, fontWeight: '700', color: on ? '#fff' : colors.brand }}>{courtLetter(courtNo)}</Text>
                          </Pressable>
                        )
                      })}
                    </View>
                  </View>
                ))}
              </>
            )}
          </Card>
        )}

        {Array.from({ length: courts }, (_, index) => index + 1).map((courtNo) => {
          const game = playing.find((item) => item.courtNo === courtNo)
          return game
            ? <LiveCourt key={courtNo} game={game} busy={busy} onFinish={(scoreA, scoreB) => run(`finish-${game.id}`, async () => {
                setBoard(await finishGame(id, game.id, { teamA: game.teamA.map((slot) => slot.attendanceId), teamB: game.teamB.map((slot) => slot.attendanceId), scoreA, scoreB }))
                notify('success', `Sân ${courtLetter(courtNo)}: ${scoreA}–${scoreB}.`)
              })} onCancel={() => confirmAction('Bỏ trận', `Bỏ trận ở sân ${courtLetter(courtNo)}? Trận bỏ không tính vào thống kê.`, () => void run(`cancel-${game.id}`, async () => { setBoard(await cancelGame(id, game.id)) }))} />
            : <FreeCourt key={courtNo} courtNo={courtNo} setup={setupFor(courtNo)} byId={byId} busy={busy} queue={queueFor(courtNo)} onQueuePick={(attendanceId) => fillFromQueue(courtNo, attendanceId)}
                onFormat={(format) => updateSetup(courtNo, emptySetup(format))}
                onPick={(slot) => setPicker({ courtNo, slot })}
                onSuggest={() => void suggest(courtNo)}
                onStart={() => void start(courtNo)} />
        })}

        {finished.length > 0 && (
          <>
            <SectionTitle>Trận đã xong</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {finished.slice(0, 15).map((game) => (
                <View key={game.id} style={styles.resultRow}>
                  <Chip label={`Sân ${courtLetter(game.courtNo)}`} bg={colors.brandSoft} fg={colors.brand} />
                  <Text style={{ flex: 1, fontSize: font.small, color: colors.ink }} numberOfLines={2}>
                    {game.teamA.map((slot) => slot.name).join(' + ')} <Text style={{ color: colors.muted }}>vs</Text> {game.teamB.map((slot) => slot.name).join(' + ')}
                  </Text>
                  <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.ink }}>{game.scoreA}–{game.scoreB}</Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>

      <Modal visible={picker !== null} animationType="slide" transparent onRequestClose={() => setPicker(null)}>
        <PlayerPicker courtNo={pickerCourt} players={candidates} selected={pickerSetup && picker ? pickerSetup.slots[picker.slot] : null} onChoose={choose} onClose={() => setPicker(null)} />
      </Modal>
    </>
  )
}

function CourtBox({ live, children }: { live: boolean; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: live ? colors.brandMid : colors.brandSoft, borderRadius: 8, padding: 6 }}>
      <View style={{ borderWidth: 2, borderColor: live ? colors.brandSoft : colors.brandLight, borderStyle: live ? 'solid' : 'dashed', flexDirection: 'row', minHeight: live ? 120 : 92 }}>{children}</View>
    </View>
  )
}

function LiveCourt({ game, busy, onFinish, onCancel }: { game: SessionGame; busy: string | null; onFinish: (a: number, b: number) => void; onCancel: () => void }) {
  const [scoreA, setScoreA] = useState(game.scoreA ?? 0)
  const [scoreB, setScoreB] = useState(game.scoreB ?? 0)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const side = (slots: SessionGame['teamA'], border: boolean) => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, borderRightWidth: border ? 3 : 0, borderRightColor: '#fff' }}>
      {slots.map((slot) => (
        <View key={slot.attendanceId} style={{ alignItems: 'center', gap: 2 }}>
          <Avatar name={slot.name} seed={slot.attendanceId} size={30} />
          <Text style={{ color: '#fff', fontSize: font.caption }} numberOfLines={1}>{slot.name}</Text>
        </View>
      ))}
    </View>
  )
  const stepper = (value: number, set: (value: number) => void, label: string) => (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Pressable accessibilityLabel={`Cộng điểm ${label}`} onPress={() => { set(Math.min(99, value + 1)); setScoreError(null) }} style={[styles.scoreButton, { backgroundColor: colors.brandSoft }]}><Icon name="plus" size={22} color={colors.brand} /></Pressable>
      <Text style={{ fontSize: font.big, fontWeight: '700', color: colors.ink }}>{value}</Text>
      <Pressable accessibilityLabel={`Trừ điểm ${label}`} onPress={() => { set(Math.max(0, value - 1)); setScoreError(null) }} style={[styles.scoreButton, { backgroundColor: colors.bg }]}><Icon name="minus" size={22} color={colors.muted} /></Pressable>
    </View>
  )
  const finish = () => {
    if (scoreA === scoreB) { setScoreError('Tỉ số hai bên không được bằng nhau.'); return }
    setScoreError(null)
    onFinish(scoreA, scoreB)
  }
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.ink }}>Sân {courtLetter(game.courtNo)} · {game.teamA.length === 1 ? 'Đơn' : 'Đôi'}</Text>
        <Chip label={`Đang đánh ${minutesSince(game.startedAtUtc)}'`} icon="circle-medium" bg={colors.live} fg="#fff" />
      </View>
      <CourtBox live>{side(game.teamA, true)}{side(game.teamB, false)}</CourtBox>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 28 }}>
        {stepper(scoreA, setScoreA, 'bên trái')}
        <Text style={{ fontSize: font.title, color: colors.muted }}>:</Text>
        {stepper(scoreB, setScoreB, 'bên phải')}
      </View>
      {scoreError && <Text style={{ color: colors.danger, fontSize: font.small, textAlign: 'center' }}>{scoreError}</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Bỏ trận" tone="danger" onPress={onCancel} disabled={busy !== null} style={{ flex: 1 }} />
        <Button label="Kết thúc" onPress={finish} busy={busy === `finish-${game.id}`} disabled={busy !== null} style={{ flex: 2 }} />
      </View>
    </Card>
  )
}

function FreeCourt({ courtNo, setup, byId, busy, queue, onQueuePick, onFormat, onPick, onSuggest, onStart }: { courtNo: number; setup: Setup; byId: Map<string, GamePlayer>; busy: string | null; queue: GamePlayer[]; onQueuePick: (attendanceId: string) => void; onFormat: (format: Format) => void; onPick: (slot: number) => void; onSuggest: () => void; onStart: () => void }) {
  const half = setup.slots.length / 2
  const slot = (index: number) => {
    const player = setup.slots[index] ? byId.get(setup.slots[index]!) : undefined
    return (
      <Pressable key={index} onPress={() => onPick(index)} style={{ alignItems: 'center', gap: 2, minWidth: 70 }}>
        {player ? <Avatar name={player.name} seed={player.attendanceId} size={34} /> : <View style={styles.emptySlot}><Icon name="plus" color={colors.brandMid} /></View>}
        <Text style={{ fontSize: font.caption, color: player ? colors.ink : colors.brandMid }} numberOfLines={1}>{player?.name ?? 'Chọn người'}</Text>
      </Pressable>
    )
  }
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.ink }}>Sân {courtLetter(courtNo)} · Trống</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(['singles', 'doubles'] as const).map((format) => (
            <Pressable key={format} onPress={() => onFormat(format)}>
              <Chip label={format === 'singles' ? 'Đơn' : 'Đôi'} bg={setup.format === format ? colors.brand : colors.bg} fg={setup.format === format ? '#fff' : colors.ink} />
            </Pressable>
          ))}
        </View>
      </View>
      <CourtBox live={false}>
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRightWidth: 3, borderRightColor: colors.brandLight }}>{setup.slots.slice(0, half).map((_, index) => slot(index))}</View>
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 }}>{setup.slots.slice(half).map((_, index) => slot(index + half))}</View>
      </CourtBox>
      {queue.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: font.caption, color: colors.muted }}>Hàng chờ sân {courtLetter(courtNo)} · chạm để điền vào ô trống</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {queue.map((player) => (
              <Pressable key={player.attendanceId} onPress={() => onQueuePick(player.attendanceId)} style={styles.queueChip}>
                <Avatar name={player.name} seed={player.attendanceId} size={22} />
                <Text style={{ fontSize: font.caption, color: colors.ink }} numberOfLines={1}>{player.name.split(' ').slice(-1)[0]} · {player.gamesPlayed} trận</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {setup.format === 'doubles' && <Button label="Gợi ý" tone="outline" icon="auto-fix" busy={busy === `suggest-${courtNo}`} disabled={busy !== null} onPress={onSuggest} style={{ flex: 1 }} />}
        <Button label="Bắt đầu" busy={busy === `start-${courtNo}`} disabled={busy !== null} onPress={onStart} style={{ flex: 1 }} />
      </View>
    </Card>
  )
}

function PlayerPicker({ courtNo, players, selected, onChoose, onClose }: { courtNo: number; players: GamePlayer[]; selected: string | null; onChoose: (id: string | null) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={styles.sheetBackdrop}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ flex: 1, fontSize: font.body, fontWeight: '700', color: colors.ink }}>Chọn người cho sân {courtLetter(courtNo)}</Text>
          <Pressable accessibilityLabel="Đóng" onPress={onClose} hitSlop={10}><Icon name="close" /></Pressable>
        </View>
        {selected && <Button label="Bỏ người này" tone="danger" icon="account-remove-outline" onPress={() => onChoose(null)} style={{ marginBottom: 8 }} />}
        <FlatList
          data={players}
          keyExtractor={(player) => player.attendanceId}
          ListEmptyComponent={<EmptyState icon="account-off-outline" title="Không còn người rảnh" />}
          renderItem={({ item }) => (
            <Pressable onPress={() => onChoose(item.attendanceId)} style={[styles.pickRow, item.attendanceId === selected && { backgroundColor: colors.brandSoft }]}>
              <Avatar name={item.name} seed={item.attendanceId} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.body, color: colors.ink }}>{item.name}{item.isGuest ? ' (khách)' : ''}</Text>
                <Text style={{ fontSize: font.caption, color: colors.muted }}>{skillLabel(item.skillRating)} · {item.gamesPlayed} trận{item.courtNo ? ` · nhóm sân ${courtLetter(item.courtNo)}` : ''}</Text>
              </View>
              {item.courtNo === courtNo && <Chip label="Hàng chờ sân" bg={colors.brandSoft} fg={colors.brand} />}
            </Pressable>
          )}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  letter: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: colors.brandLight, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  letterOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  queueChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingLeft: 4, paddingRight: 10, borderRadius: 999, backgroundColor: colors.bg },
  stepper: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  scoreButton: { width: 48, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emptySlot: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.brandLight, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: '75%' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 12 },
})
