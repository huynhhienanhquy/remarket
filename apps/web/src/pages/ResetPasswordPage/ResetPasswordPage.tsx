import { PasswordField } from "@/components/common/Input/PasswordInput";
import { useResetPasswordForm } from "./hooks/useResetPasswordForm";
import { Link } from "react-router-dom";
import { Button } from "../../components/common/Button/Button";
import { InlineAlert } from "../../components/common/InlineAlert/InlineAlert";

export function ResetPasswordPage() {
  const {
    token,
    returnTo,
    password,
    confirm,
    passwordError,
    confirmError,
    formError,
    formSuccess,
    pending,
    passwordRef,
    confirmRef,
    changePassword,
    changeConfirm,
    blurPassword,
    blurConfirm,
    submit,
  } = useResetPasswordForm();

  if (!token) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="t-h1 text-ink">Đặt lại mật khẩu</h1>
          <p className="mt-2 t-body text-muted">
            Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.
          </p>
        </div>
        <InlineAlert tone="danger" title="Liên kết không hợp lệ" />
        <p className="t-body text-muted text-center">
          <Link to="/forgot-password" className="t-label text-brand hover:underline">
            Yêu cầu liên kết mới
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-h1 text-ink">Đặt lại mật khẩu</h1>
        <p className="mt-2 t-body text-muted">
          Mật khẩu mới tối thiểu 12 ký tự.
        </p>
      </div>

      {formError !== null && <InlineAlert tone="danger" title={formError} />}
      {formSuccess !== null && <InlineAlert tone="success" title={formSuccess} />}

      {formSuccess === null && <form noValidate onSubmit={submit} className="space-y-4">
        <PasswordField
          label="Mật khẩu mới"
          id="reset-password"
          required
          helper="Tối thiểu 12 ký tự"
          error={passwordError ?? undefined}
          ref={passwordRef}
          autoComplete="new-password"
          placeholder="Tối thiểu 12 ký tự"
          value={password}
          onChange={(event) => changePassword(event.target.value)}
          onBlur={blurPassword}
        />

        <PasswordField
          label="Nhập lại mật khẩu"
          id="reset-confirm"
          required
          error={confirmError ?? undefined}
          ref={confirmRef}
          autoComplete="new-password"
          placeholder="Nhập lại mật khẩu mới"
          value={confirm}
          onChange={(event) => changeConfirm(event.target.value)}
          onBlur={blurConfirm}
        />

        <Button type="submit" size="lg" fullWidth loading={pending} variant="primary">
          Cập nhật mật khẩu
        </Button>
      </form>}

      <p className="t-body text-muted text-center">
        <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="t-label text-brand hover:underline">
          ← Quay lại đăng nhập
        </Link>
      </p>
    </div>
  );
}
