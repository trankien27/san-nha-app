import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon } from './components'
import { colors, font } from './theme'

type Toast = { tone: 'success' | 'error'; text: string } | null
const ToastContext = createContext<(tone: 'success' | 'error', text: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const insets = useSafeAreaInsets()
  const notify = useCallback((tone: 'success' | 'error', text: string) => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ tone, text })
    timer.current = setTimeout(() => setToast(null), tone === 'error' ? 4500 : 2500)
  }, [])
  return (
    <ToastContext.Provider value={notify}>
      {children}
      {toast && (
        <View pointerEvents="none" style={[styles.toast, { top: insets.top + 8, backgroundColor: toast.tone === 'success' ? colors.brand : colors.danger }]}>
          <Icon name={toast.tone === 'success' ? 'check-circle-outline' : 'alert-circle-outline'} size={18} color="#fff" />
          <Text style={styles.text}>{toast.text}</Text>
        </View>
      )}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

const styles = StyleSheet.create({
  toast: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12 },
  text: { color: '#fff', fontSize: font.small, flex: 1 },
})
