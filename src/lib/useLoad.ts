import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from './api'

/**
 * Tải dữ liệu khi màn hình được mở/quay lại; trả về trạng thái loading, error và hàm tải lại (kéo để làm mới).
 * `key` đổi (vd. id buổi, bộ lọc) thì dữ liệu của key cũ không còn hiển thị và được tải lại.
 */
export function useLoad<T>(loader: () => Promise<T>, key = '') {
  const [state, setState] = useState<{ key: string; data: T } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const loaderRef = useRef(loader)
  const keyRef = useRef(key)
  useEffect(() => { loaderRef.current = loader; keyRef.current = key })

  const run = useCallback(async (mode: 'initial' | 'refresh', forKey: string) => {
    if (mode === 'refresh') setRefreshing(true)
    setError(null)
    try {
      const value = await loaderRef.current()
      setState({ key: forKey, data: value })
    } catch (loadError) {
      setError(errorMessage(loadError, 'Không tải được dữ liệu.'))
    } finally {
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { void run('initial', key) }, [run, key]))

  // Loader có thể trả về null hợp lệ (vd. tài khoản chưa có hồ sơ người chơi), nên "đã tải" dựa vào key chứ không dựa vào data.
  const loaded = state !== null && state.key === key
  const data = loaded ? state.data : null
  const setData = useCallback((value: T) => setState({ key: keyRef.current, data: value }), [])
  return { data, setData, error, loading: !loaded && error === null, refreshing, reload: () => run('refresh', keyRef.current) }
}
