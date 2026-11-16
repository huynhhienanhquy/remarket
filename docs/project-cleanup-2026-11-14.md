# Rà soát và dọn code ngày 14/11/2026

Phạm vi: API Express, web React, mobile Expo, `shared`, `api-client`, script build,
cấu hình workspace và các điểm vào của ứng dụng, test, worker, CLI.
Các thay đổi đã có sẵn trong working tree được giữ lại.

## Thay đổi

- Xóa 19 khai báo không có nơi sử dụng: hai skeleton và props đi kèm;
  Checkbox và helper/props riêng; helper đếm ngược; các nhãn/helper nhãn thừa;
  `MONEY_LIMITS`; hai type guard và type lỗi form; hai type API/token thừa;
  instance auth được khởi tạo dư. Bỏ import `AdminPill` không dùng.
- Đổi import UI tại 80 file web sang module của từng component và xóa
  `components/common/index.ts`. Vite development không phải đi qua barrel
  tái xuất toàn bộ UI kit. Cập nhật `FRONTEND_CONVENTIONS.md` theo cách import mới.
- Tải riêng `AdminShell` và CSS quản trị khi mở khu vực admin. Giữ các layout
  tài khoản, đăng nhập và chat trong entry để tránh thêm bước tải layout
  trước khi tải trang con.
- Chỉ tải Socket.IO client của web sau khi có tài khoản hoạt động. Cleanup
  ngăn kết nối được tạo muộn sau khi provider đã unmount.
- Mobile không invalidate toàn bộ dữ liệu vừa tải khi socket kết nối lần đầu.
  Dữ liệu cache cũ vẫn được làm mới; reconnect vẫn phục hồi các sự kiện bị lỡ;
  request đang chạy không bị hủy để gọi lại trong lần bắt tay đầu tiên.
- API dùng `tsconfig.build.json` riêng: không biên dịch script vận hành và
  test của shared vào bản production. Typecheck vẫn bao phủ script và test.

## Số đo build web

So sánh production build của working tree trước và sau lượt dọn này.
Đơn vị kB thập phân, chưa nén trừ khi ghi gzip.

| Tài nguyên | Trước | Sau | Giảm |
| --- | ---: | ---: | ---: |
| JavaScript entry | 546,19 kB | 495,81 kB | 9,2% |
| JavaScript entry gzip | 159,93 kB | 144,93 kB | 9,4% |
| CSS entry | 74,11 kB | 37,45 kB | 49,5% |
| CSS entry gzip | 14,76 kB | 7,92 kB | 46,3% |

Socket.IO nằm trong chunk riêng khoảng 41,78 kB; CSS quản trị nằm trong chunk
riêng khoảng 36,55 kB. Người dùng cần các tính năng này vẫn tải các chunk đó.
Đây là số đo dung lượng build, không phải số đo thời gian phản hồi API hay
thời gian tải trang trên thiết bị thực.

## Xác minh

- Typecheck tất cả workspace thành công; web được kiểm tra lại sau khi thêm test.
- Lint tất cả workspace thành công.
- Test mới kiểm tra khách không tạo socket, unmount trước khi import hoàn tất,
  giữ kết quả vừa tải trên mobile, làm mới cache cũ, reconnect và request đang chạy.
- Kết quả test cuối của từng workspace: shared **23**, api-client **18**,
  API **309**, mobile **36**, web **270**; tổng **656 pass**.
- **58 integration test PostgreSQL bị skip** vì không cấu hình
  `TEST_DATABASE_URL`. Không chạy kiểm thử hay benchmark lên database thật.
- Build API và export mobile Android/iOS thành công qua `pnpm build`;
  web build lại sau điều chỉnh layout cuối cùng cũng thành công.
- Output API có 100 file, không chứa thư mục script hoặc file `*.test.js`.
- `pnpm --filter @remarket/api contracts:check` và `git diff --check` thành công.

Không xóa migration, dữ liệu, script CLI/worker hoặc dependency chỉ vì chúng
không được import từ màn hình. Các điểm vào và cách framework nạp module
được đối chiếu trước khi xác định code thừa.
