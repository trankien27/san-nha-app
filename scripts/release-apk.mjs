// Phát hành APK lên GitHub Release để app tự cập nhật.
//   npm run release:apk -- [--apk <đường dẫn .apk>] [--notes "Ghi chú"] [--repo owner/name]
// Không truyền --apk: lấy bản build Android mới nhất trên EAS đúng phiên bản trong app.json rồi tải về.
// Cần: GitHub CLI đã đăng nhập (gh auth login) và repo release phải public.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')).expo
const args = process.argv.slice(2)
const arg = (name) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined }

const version = app.version
const repo = arg('repo') ?? app.extra?.updateRepo
const notes = arg('notes') ?? `Sân Nhà ${version}`
const tag = `v${version}`
// gh chạy trực tiếp (không qua shell) để ghi chú có dấu cách/tiếng Việt không bị tách; npx trên Windows là npx.cmd nên cần shell.
const run = (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: cmd === 'npx' && process.platform === 'win32' })

if (!repo) throw new Error('Thiếu repo: đặt expo.extra.updateRepo trong app.json hoặc truyền --repo owner/name.')
try { run('gh', ['auth', 'status']) } catch { throw new Error('GitHub CLI chưa đăng nhập. Chạy: gh auth login') }
try { run('gh', ['repo', 'view', repo, '--json', 'visibility']) } catch {
  throw new Error(`Không thấy repo ${repo}. Tạo repo public trước: gh repo create ${repo} --public`)
}

let apkPath = arg('apk')
if (!apkPath) {
  const builds = JSON.parse(run('npx', ['eas-cli@latest', 'build:list', '--platform', 'android', '--status', 'finished', '--limit', '5', '--json', '--non-interactive']))
  const build = builds.find((item) => item.appVersion === version && item.artifacts?.buildUrl?.endsWith('.apk'))
  if (!build) throw new Error(`Chưa có bản build APK nào của phiên bản ${version} trên EAS. Chạy: npm run build:apk`)
  mkdirSync(path.join(root, 'dist-apk'), { recursive: true })
  apkPath = path.join(root, 'dist-apk', `san-nha-${version}.apk`)
  console.log(`Tải ${build.artifacts.buildUrl}`)
  const response = await fetch(build.artifacts.buildUrl)
  if (!response.ok) throw new Error(`Tải APK thất bại: ${response.status}`)
  writeFileSync(apkPath, Buffer.from(await response.arrayBuffer()))
}
if (!existsSync(apkPath)) throw new Error(`Không thấy file ${apkPath}`)

// gh lấy tên file làm tên asset, nên chép về tên cố định "san-nha-<phiên bản>.apk" trước khi đẩy lên.
const releaseFile = path.join(root, 'dist-apk', `san-nha-${version}.apk`)
if (path.resolve(apkPath) !== path.resolve(releaseFile)) { mkdirSync(path.dirname(releaseFile), { recursive: true }); copyFileSync(apkPath, releaseFile) }
console.log(`Tạo release ${tag} trên ${repo}…`)
run('gh', ['release', 'create', tag, releaseFile, '--repo', repo, '--title', `Sân Nhà ${version}`, '--notes', notes, '--latest'])
console.log(`Xong: https://github.com/${repo}/releases/tag/${tag}`)
