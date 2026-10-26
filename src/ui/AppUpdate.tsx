import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import { errorMessage } from '@/lib/api'
import { canSelfUpdate, checkForUpdate, currentVersion, downloadAndInstall, formatSize, type AppRelease } from '@/lib/appUpdate'
import { Banner, Button, Icon } from './components'
import { colors, font } from './theme'

type Status = 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'error'

/** Trạng thái kiểm tra / tải bản cập nhật dùng chung cho hộp thoại tự bật và mục "Cập nhật app". */
export function useAppUpdate() {
  const [status, setStatus] = useState<Status>('idle')
  const [release, setRelease] = useState<AppRelease | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async () => {
    if (!canSelfUpdate) return null
    setStatus('checking'); setError(null)
    try {
      const next = await checkForUpdate()
      setRelease(next)
      setStatus(next ? 'available' : 'latest')
      return next
    } catch (checkError) {
      setError(errorMessage(checkError)); setStatus('error')
      return null
    }
  }, [])

  const install = useCallback(async () => {
    if (!release) return
    setStatus('downloading'); setProgress(0); setError(null)
    try {
      await downloadAndInstall(release, setProgress)
      setStatus('available')
    } catch (installError) {
      setError(errorMessage(installError, 'Không cài được bản cập nhật.')); setStatus('error')
    }
  }, [release])

  return { status, release, progress, error, check, install }
}

/** Tự kiểm tra bản mới một lần khi mở app; có bản mới thì hỏi người dùng cập nhật. */
export function UpdateChecker() {
  const update = useAppUpdate()
  const [visible, setVisible] = useState(false)
  const checked = useRef(false)
  const { check } = update
  useEffect(() => {
    if (checked.current || !canSelfUpdate) return
    checked.current = true
    // Lỗi mạng khi tự kiểm tra thì bỏ qua lặng lẽ; người dùng vẫn kiểm tra tay được trong mục Tôi.
    void check().then((next) => { if (next) setVisible(true) })
  }, [check])
  if (!update.release) return null
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (update.status !== 'downloading') setVisible(false) }}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <UpdateDetails update={update} onLater={() => setVisible(false)} />
        </View>
      </View>
    </Modal>
  )
}

/** Mục "Cập nhật app" trong màn Tôi: phiên bản hiện tại, nút kiểm tra và cài. */
export function UpdateSection() {
  const update = useAppUpdate()
  if (!canSelfUpdate) return <Text style={styles.version}>Phiên bản {currentVersion}</Text>
  return (
    <View style={{ gap: 10 }}>
      {update.release ? <UpdateDetails update={update} /> : (
        <>
          <Text style={styles.version}>Phiên bản {currentVersion}{update.status === 'latest' ? ' · đang là bản mới nhất' : ''}</Text>
          {update.error && <Banner tone="danger" icon="alert-circle-outline" text={update.error} />}
          <Button label="Kiểm tra cập nhật" tone="outline" icon="update" busy={update.status === 'checking'} onPress={() => void update.check()} />
        </>
      )}
    </View>
  )
}

function UpdateDetails({ update, onLater }: { update: ReturnType<typeof useAppUpdate>; onLater?: () => void }) {
  const { release, status, progress, error } = update
  if (!release) return null
  const downloading = status === 'downloading'
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={styles.icon}><Icon name="rocket-launch-outline" size={22} color={colors.brand} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.ink }}>Có bản mới {release.version}</Text>
          <Text style={{ fontSize: font.caption, color: colors.muted }}>Đang dùng {currentVersion} · tải {formatSize(release.sizeBytes)}</Text>
        </View>
      </View>
      {release.notes ? <ScrollView style={{ maxHeight: 160 }}><Text style={{ fontSize: font.small, color: colors.ink }}>{release.notes}</Text></ScrollView> : null}
      {downloading && (
        <View style={{ gap: 4 }}>
          <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} /></View>
          <Text style={{ fontSize: font.caption, color: colors.muted }}>Đang tải {Math.round(progress * 100)}%… Xong sẽ mở màn hình cài đặt của Android.</Text>
        </View>
      )}
      {error && <Banner tone="danger" icon="alert-circle-outline" text={error} />}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {onLater && <Button label="Để sau" tone="outline" disabled={downloading} onPress={onLater} style={{ flex: 1 }} />}
        <Button label={downloading ? 'Đang tải…' : 'Cập nhật'} icon="download" busy={downloading} onPress={() => void update.install()} style={{ flex: 1 }} />
      </View>
      <Text style={{ fontSize: font.caption, color: colors.muted }}>Lần đầu cập nhật, Android sẽ hỏi cho phép app cài ứng dụng: bật cho phép rồi quay lại.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: '#fff', borderRadius: 20, padding: 18 },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.bg },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.brandMid },
  version: { fontSize: font.small, color: colors.muted, textAlign: 'center' },
})
