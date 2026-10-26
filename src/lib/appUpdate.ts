import * as Application from 'expo-application'
import Constants from 'expo-constants'
import { Directory, File, Paths } from 'expo-file-system'
import * as IntentLauncher from 'expo-intent-launcher'
import { Platform } from 'react-native'

// Cập nhật app Android bằng GitHub Release: release có tag "v<phiên bản>" (vd. v1.0.1) và đính kèm một file .apk.
// Repo phải public để điện thoại tải được mà không cần token. Đổi repo ở app.json → expo.extra.updateRepo.
export const UPDATE_REPO = (Constants.expoConfig?.extra?.updateRepo as string | undefined) ?? 'trankien27/san-nha-app'
export const currentVersion = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0'
export const canSelfUpdate = Platform.OS === 'android'

export interface AppRelease {
  version: string
  title: string
  notes: string
  apkUrl: string
  apkName: string
  sizeBytes: number
  publishedAt: string
}

interface GitHubRelease {
  tag_name: string
  name: string | null
  body: string | null
  draft: boolean
  prerelease: boolean
  published_at: string
  assets: { name: string; browser_download_url: string; size: number }[]
}

/** So sánh phiên bản dạng 1.2.3; trả về số dương nếu a mới hơn b. */
export function compareVersions(a: string, b: string) {
  const pa = a.replace(/^v/i, '').split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0)
  const pb = b.replace(/^v/i, '').split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Lấy release mới nhất có file APK; trả về null nếu đang dùng bản mới nhất. */
export async function checkForUpdate(): Promise<AppRelease | null> {
  const response = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
  if (response.status === 404) throw new Error('Chưa có bản phát hành nào trên GitHub (hoặc repo chưa public).')
  if (!response.ok) throw new Error(`Không kiểm tra được bản mới (GitHub trả ${response.status}).`)
  const release = await response.json() as GitHubRelease
  const apk = release.assets.find((asset) => asset.name.toLowerCase().endsWith('.apk'))
  if (release.draft || release.prerelease || !apk) return null
  const version = release.tag_name.replace(/^v/i, '')
  if (compareVersions(version, currentVersion) <= 0) return null
  return { version, title: release.name || `Phiên bản ${version}`, notes: release.body?.trim() ?? '', apkUrl: apk.browser_download_url, apkName: apk.name, sizeBytes: apk.size, publishedAt: release.published_at }
}

/** Tải APK vào bộ nhớ đệm rồi mở trình cài đặt của Android; người dùng xác nhận cài trên màn hình hệ thống. */
export async function downloadAndInstall(release: AppRelease, onProgress: (fraction: number) => void) {
  if (!canSelfUpdate) throw new Error('Chỉ cập nhật trực tiếp được trên Android.')
  const folder = new Directory(Paths.cache, 'updates')
  if (folder.exists) folder.delete()
  folder.create()
  const target = new File(folder, `san-nha-${release.version}.apk`)
  const task = File.createDownloadTask(release.apkUrl, target, {
    onProgress: ({ bytesWritten, totalBytes }) => onProgress((totalBytes > 0 ? bytesWritten / totalBytes : release.sizeBytes > 0 ? bytesWritten / release.sizeBytes : 0)),
  })
  const file = await task.downloadAsync()
  if (!file?.exists) throw new Error('Tải bản cập nhật chưa xong, thử lại.')
  onProgress(1)
  // FLAG_GRANT_READ_URI_PERMISSION = 1: cho trình cài đặt đọc file qua content:// của app.
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: file.contentUri, flags: 1, type: 'application/vnd.android.package-archive' })
}

export function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.round(bytes / 1024)} KB`
}
