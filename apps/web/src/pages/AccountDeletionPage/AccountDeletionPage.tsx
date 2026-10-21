import { useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../../contexts/SessionContext";
import { http } from "../../services/http";
import { Button, InlineAlert } from "../../components/common";
import { PasswordInput } from "../../components/common/Input/PasswordInput";

export function AccountDeletionPage() {
  const { viewer, expire } = useSession();
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="mx-auto max-w-[640px] space-y-6 py-8">
      <h1 className="t-h1">Xóa tài khoản ReMarket</h1>
      <p className="text-ink-muted">
        Bạn có thể yêu cầu xóa tài khoản từ ứng dụng hoặc tại trang này. Hãy
        hoàn tất các đơn hàng và yêu cầu hỗ trợ đang mở trước khi xóa.
      </p>
      <p className="text-ink-muted">
        Hồ sơ, ảnh và nội dung bạn tạo được xóa. Các tham chiếu giao dịch được
        giữ dưới tên tài khoản đã xóa. Thao tác này không thể hoàn tác.
      </p>
      {deleted ? (
        <InlineAlert tone="success" title="Tài khoản đã được xóa" />
      ) : !viewer ? (
        <Link to="/login?returnTo=%2Fdelete-account" className="text-brand">
          Đăng nhập để xác nhận tài khoản của bạn
        </Link>
      ) : (
        <form
          className="space-y-4 rounded-card border border-line bg-surface p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending || !confirmed) return;
            setPending(true);
            setError("");
            try {
              await http.post("/mobile/delete-account", { password });
              http.setAccessToken(null);
              expire();
              setPassword("");
              setDeleted(true);
            } catch (caught) {
              setError(
                caught instanceof Error
                  ? caught.message
                  : "Không thể xóa tài khoản.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <p>{viewer.email}</p>
          <label className="block space-y-2">
            <span>Mật khẩu xác nhận</span>
            <PasswordInput
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>Tôi xác nhận xóa tài khoản và nội dung của mình.</span>
          </label>
          {error && <InlineAlert tone="danger" title={error} />}
          <Button
            type="submit"
            variant="danger"
            disabled={pending || !confirmed || !password}
          >
            {pending ? "Đang xử lý…" : "Xóa tài khoản của tôi"}
          </Button>
        </form>
      )}
      <Link to="/support" className="text-brand">
        Liên hệ hỗ trợ về tài khoản
      </Link>
    </div>
  );
}
