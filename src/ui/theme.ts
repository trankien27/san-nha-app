// Bảng màu của app (theo mockup): xanh rêu cho phần chung/tại sân, tím cho tiền, cam cho trận đang đánh, vàng cho cảnh báo.
export const colors = {
  bg: '#f4f6f3',
  card: '#ffffff',
  ink: '#1d2b27',
  muted: '#6b7a74',
  line: '#e6ebe8',
  brand: '#085041',
  brandMid: '#0F6E56',
  brandSoft: '#E1F5EE',
  brandLight: '#9FE1CB',
  money: '#3C3489',
  moneyMid: '#534AB7',
  moneySoft: '#EEEDFE',
  moneyLight: '#AFA9EC',
  live: '#D85A30',
  liveSoft: '#FAECE7',
  liveDark: '#712B13',
  warnSoft: '#FAEEDA',
  warn: '#854F0B',
  warnDark: '#633806',
  okSoft: '#EAF3DE',
  ok: '#27500A',
  dangerSoft: '#FCEBEB',
  danger: '#A32D2D',
  neutralSoft: '#F1EFE8',
  neutral: '#5F5E5A',
}

/** Cỡ chữ theo bảng đã thống nhất (pt). */
export const font = { caption: 12, small: 13, body: 15, title: 20, big: 28 }

const avatarPalette: [string, string][] = [
  ['#9FE1CB', '#04342C'], ['#CECBF6', '#26215C'], ['#B5D4F4', '#042C53'], ['#F5C4B3', '#4A1B0C'],
  ['#FAC775', '#412402'], ['#C0DD97', '#173404'], ['#F4C0D1', '#4B1528'],
]

/** Màu avatar cố định theo tên để cùng một người luôn cùng màu. */
export function avatarColors(seed: string): [string, string] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return avatarPalette[Math.abs(hash) % avatarPalette.length]
}
