import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { validatePassword, validatePasswordConfirm } from "@remarket/shared";
import { useSession } from "../../app/SessionProvider";
import { safeReturnTo } from "../../app/guards";
import { errorTitle, isApiError } from "../../lib/errors";
import { api } from "../../lib/api";
import { Button, FormField, InlineAlert, Input } from "../../components/ui";

function fieldMessages(caught: unknown): Record<string, string> | null {
  if (!isApiError(caught)) return null;
  const raw = caught.fields ?? caught.details?.fields;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const messages: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value !== "") messages[key] = value;
  }
  return Object.keys(messages).length > 0 ? messages : null;
}

export function ResetPasswordPage() {
  const _navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const { login: _login } = useSession();

  const token = params.get("token");
  const returnTo = safeReturnTo(params.get("returnTo") ?? "/", "");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  function changePassword(value: string) {
    setPassword(value);
    if (passwordTouched) setPasswordError(validatePassword(value));
    if (formError !== null) setFormError(null);
  }

  function changeConfirm(value: string) {
    setConfirm(value);
    if (confirmTouched) setConfirmError(validatePasswordConfirm(password, value));
    if (formError !== null) setFormError(null);
  }

  function blurPassword() {
    setPasswordTouched(true);
    setPasswordError(validatePassword(password));
  }

  function blurConfirm() {
    setConfirmTouched(true);
    setConfirmError(validatePasswordConfirm(password, confirm));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!token) {
      setFormError("Liên kết đặt lại mật khẩu không hợp lệ.");
      return;
    }

    const nextPasswordError = validatePassword(password);
    const nextConfirmError = validatePasswordConfirm(password, confirm);
    setPasswordTouched(true);
    setConfirmTouched(true);
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    setFormError(null);

    if (nextPasswordError !== null) {
      passwordRef.current?.focus();
      return;
    }
    if (nextConfirmError !== null) {
      confirmRef.current?.focus();
      return;
    }

    setPending(true);
    try {
      await api.auth.resetPassword(token, password);
      queryClient.clear();
      setFormSuccess("Mật khẩu đã được cập nhật. Bạn có thể đăng nhập ngay bây giờ.");
    } catch (caught) {
      if (isApiError(caught) && (caught.code === "TOKEN_EXPIRED" || caught.code === "INVALID_TOKEN")) {
        setFormError("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
      } else if (isApiError(caught)) {
        const fields = fieldMessages(caught);
        if (fields !== null) {
          if (fields.password !== undefined) {
            setPasswordError(fields.password);
            passwordRef.current?.focus();
          } else if (fields.confirm !== undefined) {
            setConfirmError(fields.confirm);
            confirmRef.current?.focus();
          }
        }
        setFormError(caught.message || "Không đặt lại được mật khẩu.");
      } else {
        setFormError(errorTitle(caught));
      }
    } finally {
      setPending(false);
    }
  }

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
          Mật khẩu mới phải khác mật khẩu cũ. Tối thiểu 12 ký tự.
        </p>
      </div>

      {formError !== null && <InlineAlert tone="danger" title={formError} />}
      {formSuccess !== null && <InlineAlert tone="success" title={formSuccess} />}

      <form noValidate onSubmit={submit} className="space-y-4">
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
      </form>

      <p className="t-body text-muted text-center">
        <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="t-label text-brand hover:underline">
          ← Quay lại đăng nhập
        </Link>
      </p>
    </div>
  );
}