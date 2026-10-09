import { useResetPasswordForm } from "./hooks/useResetPasswordForm";
import { Link } from "react-router-dom";
import { Button, FormField, InlineAlert, Input } from "../../components/common";

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
    showPassword,
    setShowPassword,
    showConfirm,
    setShowConfirm,
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
        <FormField
          label="Mật khẩu mới"
          htmlFor="reset-password"
          required
          helper="Tối thiểu 12 ký tự"
          error={passwordError ?? undefined}
        >
          <div className="relative">
            <Input
              ref={passwordRef}
              id="reset-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Tối thiểu 12 ký tự"
              value={password}
              error={passwordError !== null}
              aria-describedby={passwordError !== null ? "reset-password-error" : undefined}
              className="pr-20"
              onChange={(event) => changePassword(event.target.value)}
              onBlur={blurPassword}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-1 my-auto h-9 rounded-control px-2 t-meta text-brand hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            >
              {showPassword ? "Ẩn" : "Hiện"}
            </button>
          </div>
        </FormField>

        <FormField
          label="Nhập lại mật khẩu"
          htmlFor="reset-confirm"
          required
          error={confirmError ?? undefined}
        >
          <div className="relative">
            <Input
              ref={confirmRef}
              id="reset-confirm"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu mới"
              value={confirm}
              error={confirmError !== null}
              aria-describedby={confirmError !== null ? "reset-confirm-error" : undefined}
              className="pr-20"
              onChange={(event) => changeConfirm(event.target.value)}
              onBlur={blurConfirm}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((visible) => !visible)}
              aria-label={showConfirm ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              aria-pressed={showConfirm}
              className="absolute inset-y-0 right-1 my-auto h-9 rounded-control px-2 t-meta text-brand hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            >
              {showConfirm ? "Ẩn" : "Hiện"}
            </button>
          </div>
        </FormField>

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
