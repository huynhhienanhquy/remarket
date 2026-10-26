# Database, chat và thông báo — 22/10/2026

Đợt này tiếp tục trên các thay đổi navigation/database đã có trong workspace,
giữ Prisma 5.22 và giới hạn connection hiện tại.

## Các điểm nghẽn đã sửa

- HTTP pool pg giữ tối đa hai connection đã warm, nằm trong `connection_limit`.
  Trước đây sau 60 giây idle cả hai bị đóng, request tiếp theo phải TLS/auth lại.
  Background pool vẫn có thể idle out. `min` không tự mở thêm connection;
  startup warmup hiện có đảm nhiệm việc đó theo [API pg.Pool](https://node-postgres.com/apis/pool).
- Gửi chat lấy trạng thái tài khoản ngay trong query khóa User, lấy trạng thái
  sản phẩm trong query khóa Product, dùng lại productId của thread và ghi hai
  outbox event cùng một batch. Giữ kiểm tra block sau khi đã khóa User để không
  dùng snapshot block cũ khi phải chờ khóa; không cache quyền hay session.
- Sau commit, chat và read receipt phát ngay tới socket trên API hiện tại.
  Durable outbox vẫn phục hồi khi process lỗi và phát tới các API instance khác.
  Phát message bằng union room để recipient đang mở thread không nhận hai bản.
  Có bộ nhớ dedupe giới hạn cho message/notification khi relay bắt kịp.
- Relay promote tới 100 event realtime bằng một SQL thay vì mở transaction và
  ghi lease/sequence từng event. Giữ cùng advisory transaction lock để sequence
  không vượt commit trước đó; không claim email, xóa ảnh, lease còn hiệu lực,
  event chưa đến lịch hoặc đã hết retry. Email/storage chạy ở lane riêng.
- Push có timer riêng, mặc định `MOBILE_PUSH_INTERVAL_MS=5000`; trước đây chỉ
  chạy sau maintenance mặc định mỗi 60 giây. Guard ngăn các lượt push chồng nhau.
- Web/mobile merge tin và read receipt vào cache, giữ cursor các trang cũ,
  đối chiếu sender/client ID và không xóa read receipt bởi payload cũ.
  Hủy refetch cũ trước khi merge và chặn callback sau khi đổi session/unmount.
  Notification event phụ trách cập nhật badge, tránh hai lần refetch cho một tin.
- Web xếp tin tiếp theo trong lúc tin trước còn gửi, giữ thứ tự bằng mutation
  scope. Dựng danh sách bằng Map và memoization, bỏ phép duyệt bậc hai mỗi lần gõ.
  Mobile hiển thị tin đang gửi ngay và cho phép soạn tin kế tiếp.
- Lịch sử/inbox web ngừng polling khi socket kết nối; reconnect vẫn revalidate,
  khi mất socket dùng polling dự phòng. Badge/thông báo vẫn có polling để bắt các
  thay đổi đọc thông báo từ thiết bị khác.
- Migration `20261022000000_communication_performance` thêm 5 index cho sắp xếp
  inbox buyer/seller, unread message, notification theo user/time và pending
  realtime outbox. Đã deploy thành công trên database đang cấu hình; không sửa
  hoặc xóa bản ghi nghiệp vụ.

## Số đo

| Probe | Trước | Sau |
| --- | --- | --- |
| Xử lý 8 event realtime trên PostgreSQL, cùng lượt thử | 15.028 ms | 364 ms |
| SELECT 1 sau idle, không giữ/giữ connection đã warm | 1.423 ms | 233 ms |

Mỗi đường chỉ một mẫu, không phải median/p95 hoặc thời gian gửi chat end-to-end.
Probe idle rút timeout xuống 200 ms và chờ 400 ms để kiểm tra cơ chế eviction;
trước còn 0 connection, sau còn 2. Timeout production vẫn 60 giây. Không đổi
region, tăng pool hay tắt xác minh TLS. Mạng tới database vẫn là phần chi phí còn lại.

Raw local: `.artifacts/performance/communication-batch.json` và
`.artifacts/performance/http-idle-pool.json`.

## Kiểm chứng và sử dụng

- Unit/contract API, toàn bộ test web/mobile/shared đã pass; typecheck và lint
  API/web/mobile đã pass, build API/web pass.
- Hai test communication và năm test reliability PostgreSQL pass trên các schema
  riêng đã được dọn, gồm rollback, retry không trùng, block và thứ tự commit giữa
  worker cũ với batch worker mới.
- Browser/API thật: 9 responsive checks pass cho badge inbox trên desktop/mobile,
  tin outgoing/private, nhận qua WebSocket và xóa unread sau đọc/reload; không có
  uncaught browser exception hoặc HTTP 5xx. Report local:
  `.artifacts/member-smoke/results-chat-badge.json`.
- Chưa đo push đến điện thoại vật lý. Thay đổi 60s → 5s là lịch pump mặc định,
  không phải cam kết thời gian Expo/OS chuyển push tới thiết bị. Cần giữ worker
  và cấu hình push hiện có; không tự bật gửi push tới thiết bị thật trong test.

Tái lập bằng `node apps/api/scripts/verify-isolated.mjs --communication-only --driver-pg`,
`--reliability-only --driver-pg`, hoặc `--browser-only --chat-badge-only --driver-pg`.
Các harness tạo schema ngẫu nhiên và tự dọn. Không chạy integration trực tiếp
trên bảng ứng dụng.

Khởi động lại API/worker và reload web/mobile để mọi process nhận code mới.
Môi trường deploy khác cần chạy `prisma migrate deploy` trước hoặc cùng bản API.
