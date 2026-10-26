# Sân Nhà — app di động

App React Native (Expo SDK 58, Expo Router) cho CLB cầu lông. Bản đầu **chỉ chạy khi có mạng**: mọi dữ liệu đọc/ghi trực tiếp qua API backend `Be.Clean` (mặc định `https://bm-club-be.fly.dev`, database PostgreSQL trên cloud). App không kết nối thẳng vào database và chưa lưu dữ liệu offline.

## Chức năng

| Tab / màn | Ai thấy | Làm được gì |
|---|---|---|
| Đăng nhập, đổi mật khẩu tạm | Mọi người | Đăng nhập bằng tài khoản web; tài khoản mật khẩu tạm bắt buộc đổi mật khẩu |
| Hôm nay | Mọi người | Buổi sắp tới, lối tắt tại sân, số liệu nhanh, việc cần xử lý (đã ẩn phần QR SePay) |
| Lịch | Mọi người | Buổi sắp tới / 60 ngày qua; chi tiết buổi; người chơi tự đăng ký, hủy, vào danh sách chờ |
| Tại sân | Quản trị, Hỗ trợ, Kế toán | Các buổi hôm nay và lối tắt điểm danh / chia trận / tiền buổi |
| Điểm danh | Quản trị, Hỗ trợ, Kế toán | Chọn thành viên có mặt, thêm khách, lưu cả danh sách (khóa khi đã chốt tiền) |
| Chia trận | Quản trị, Hỗ trợ | Đổi số sân; chia người theo sân A/B… (chạm chữ cái, hoặc chia đều theo trình độ) và hàng chờ từng sân; chọn người hoặc gợi ý đôi, bắt đầu, ghi tỉ số, kết thúc, bỏ trận |
| Tính tiền | Quản trị, Kế toán | Tiền sân, tiền sân thực trả, vật tư, tổng số người, phụ phí, miễn thu; lưu nháp, chốt; mở lại (Quản trị); thu theo buổi ghi tay |
| Thu tiền, Tiền buổi | Quản trị, Kế toán | Buổi còn thiếu / chưa tính tiền; ghi đã thu từng người, bỏ đánh dấu, gửi danh sách vào nhóm |
| Công nợ, Đã thu, Thu chi, Đối soát | Quản trị, Kế toán | Ghi đã thu theo khoản hoặc theo người chơi, đảo thanh toán, báo cáo thu chi và đối soát theo tháng |
| Vật tư | Quản trị, Kế toán | Danh sách, thêm/sửa, đổi giá có lý do, nhập/hỏng/mất/điều chỉnh, lịch sử và đảo giao dịch |
| Người chơi, Địa điểm và sân | Quản trị, Hỗ trợ | Thêm/sửa người chơi; thêm/sửa/ngừng địa điểm và sân |
| Tạo/sửa/sao chép/hủy lịch, quản lý đăng ký | Quản trị, Hỗ trợ | Lịch lặp hằng tuần; thêm/bớt người đăng ký, danh sách chờ |
| Thống kê trận | Quản trị, Hỗ trợ | Thắng/thua theo khoảng ngày, phong độ từng người |
| Báo cáo | Quản trị, Kế toán | Tài chính, tham gia, vật tư theo tháng (xuất Excel vẫn làm trên web) |
| Tài khoản, Cài đặt CLB | Quản trị | Tạo tài khoản, đổi vai trò, khóa/mở, đặt lại mật khẩu; thông tin CLB |
| Thêm (tab cuối) | Mọi người | Menu các mục trên theo vai trò, công nợ cá nhân, đổi mật khẩu, cập nhật app, đăng xuất |

Còn làm trên web: nhập/xuất Excel, lịch sử giá sân, phân tích trận đánh đơn.

## Cập nhật app qua GitHub Release

App Android tự kiểm tra bản mới khi mở (và nút "Kiểm tra cập nhật" ở tab Thêm): gọi `https://api.github.com/repos/<repo>/releases/latest`, nếu tag `v<phiên bản>` mới hơn bản đang cài thì tải file `.apk` của release và mở trình cài đặt Android. Repo cấu hình ở `app.json` → `expo.extra.updateRepo` (mặc định `trankien27/san-nha-app`) và **phải public** để điện thoại tải được không cần token.

Phát hành một bản mới:

1. Tăng `expo.version` (vd. `1.1.0` → `1.2.0`) và `expo.android.versionCode` (+1) trong `app.json`.
2. `npm run build:apk` (build trên EAS, chờ xong).
3. `gh auth login` (một lần), tạo repo nếu chưa có: `gh repo create trankien27/san-nha-app --public`.
4. `npm run release:apk -- --notes "Có gì mới"` — tải APK của bản build vừa xong và tạo release `v<phiên bản>`.

Bản 1.0.0 đầu tiên chưa có tính năng tự cập nhật: cài tay bản 1.1.0 một lần, từ đó các bản sau tự cập nhật.

## Chạy thử trên điện thoại

```bash
cd mobile
npm install
npx expo start
```

Cài **Expo Go** trên điện thoại rồi quét mã QR hiện ra trong terminal. App gọi backend cloud, nên đăng nhập bằng tài khoản thật của CLB.

Chạy với backend local thay cho cloud (không đụng dữ liệu thật):

```bash
set EXPO_PUBLIC_API_URL=http://<IP máy tính>:5171
npx expo start
```

Trên web (`npx expo start --web`) cần thêm origin `http://localhost:8081` vào `Cors__Origins` của backend. App iOS/Android không cần cấu hình CORS.

## Đăng nhập

Access token chỉ giữ trong bộ nhớ. Refresh token là cookie HttpOnly do backend đặt; trên iOS/Android, `fetch` của React Native tự lưu và gửi lại cookie nên mở lại app vẫn còn đăng nhập (tối đa 14 ngày theo cấu hình backend). Không cần sửa backend.

## Kiểm tra

```bash
npm run typecheck
npx eslint src
```

## Cấu trúc

- `src/app/` — màn hình (Expo Router): `(tabs)/` 5 tab, `buoi/[id]/` chi tiết buổi, điểm danh, chia trận, tiền buổi.
- `src/lib/` — gọi API (`api.ts`, `endpoints.ts`), kiểu dữ liệu, định dạng tiền VNĐ và giờ Asia/Bangkok.
- `src/auth/` — phiên đăng nhập và quyền theo vai trò.
- `src/ui/` — màu, cỡ chữ, component dùng chung.

## Build cài đặt

Dùng EAS: `npx eas-cli@latest build --platform android` (hoặc `ios`). Cần tài khoản Expo; lên App Store cần tài khoản Apple Developer.
