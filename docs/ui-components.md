# Toast và icon dùng chung

Các component dùng React, SVG và timer của trình duyệt, không dùng thư viện toast/icon.
Import từ `apps/web/src/components/common` (hoặc `@/components/common` trong frontend).

## Toast

`ToastProvider` đã được gắn tại root router. Trong component:

```tsx
import { useToast } from "@/components/common";

function SaveButton() {
  const toast = useToast();
  return (
    <button onClick={() => toast.success("Đã lưu", {
      description: "Thay đổi đã được cập nhật.",
      duration: 4000,
      action: { label: "Xem hồ sơ", to: "/account" },
    })}>
      Lưu
    </button>
  );
}
```

- `success`, `info`, `warning`: tự đóng sau 4 giây mặc định.
- `error`: giữ đến khi đóng. Có thể chỉ định `duration` nếu cần tự đóng.
- `duration: 0`: không tự đóng. Thời gian tính bằng mili giây.
- Hover hoặc focus trong toast tạm dừng timer; sau đó tiếp tục thời gian còn lại.
- Các hàm trả về ID để gọi `toast.dismiss(id)`; `toast.dismissAll()` đóng tất cả.
- Action dùng router link và đóng toast khi được chọn.
- Toast lỗi dùng `role="alert"`; các loại khác dùng `role="status"`.

Có thể dùng thẻ `Toast` độc lập với `title`, `tone`, `description`, `duration`,
`onDismiss` và `className`. `onDismiss` phải cập nhật state của nơi gọi để ẩn thẻ.
Chỉ cần nằm trong router khi truyền `action`.

## Icon

```tsx
import { Icon, CategoryIcon, HeartIcon } from "@/components/common";

<Icon name="search" size={20} className="text-muted" />
<HeartIcon size={24} />
<CategoryIcon slug="dien-tu" size={24} />
<button aria-label="Đóng"><Icon name="x" /></button>
<Icon name="info" aria-label="Thông tin" />
```

`IconName` kiểm tra tên icon bằng TypeScript. Các component như `HeartIcon`,
`SearchIcon`, `InboxIcon` vẫn có thể import trực tiếp. SVG mặc định là 20px,
viewBox 24×24, stroke 1.75, dùng `currentColor` và nhận SVG props thông thường.
Icon trang trí ẩn với trình đọc màn hình; truyền `aria-label` hoặc
`aria-labelledby` cho icon mang nội dung. Nút chỉ có icon cần `aria-label` trên nút.
`CategoryIcon` nhận slug danh mục và dùng biểu tượng trung tính khi slug chưa có.

## UnreadBadge

`UnreadBadge` nằm trong `components/common/UnreadBadge`, dùng cho header và
thanh điều hướng mobile. Truyền số thật từ API; 0 thì ẩn, trên 99 hiển thị
`99+`, nhãn truy cập vẫn chứa số đầy đủ. Đặt trong phần tử `relative`; link
chứa badge cần nêu số chưa đọc trong `aria-label`.

Tin nhắn dùng `useUnreadMessageCount`, cache riêng theo người xem. API đếm
tin nhận chưa đọc trong mọi hội thoại của chính người đó. Sự kiện realtime
và thao tác đọc invalidate cache; polling 30 giây bổ sung khi cần, không
poll tab ẩn/offline. Guest và tài khoản khóa không gọi API chat.
