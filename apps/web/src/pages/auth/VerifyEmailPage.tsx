import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { validateEmail } from "@remarket/shared";
import { useSession } from "../../app/SessionProvider";
import { safeReturnTo } from "../../app/guards";
import { isApiError } from "../../lib/errors";
import { api } from "../../lib/api";
import { Button, FormField, InlineAlert, Input } from "../../components/ui";

export function VerifyEmailPage() {
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { viewer, refresh } = useSession();

  const token = params.get("token");
  const email = params.get("email");
  const returnTo = safeReturnTo(params.get("returnTo") ?? "/", "");

  const [verifyEmail, setVerifyEmail] = useState(email ?? "");
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);

  async function sendVerification() {
    if (pending) return;
    const nextEmailError = validateEmail(verifyEmail);
    setEmailTouched(true);
    setEmailError(nextEmailError);
    if (nextEmailError !== null) {
      emailRef.current?.focus();
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      await api.auth.resendVerification(verifyEmail.trim());
      setFormSuccess("Nếu email có trong hệ thống, liên kết xác minh đã được gửi lại.");
    } catch (caught) {
      setFormError(isApiError(caught) ? caught.message : "Không gửi được email xác minh.");
    } finally {
      setPending(false);
    }
  }

  async function verify() {
    if (!token || pending) return;
    setPending(true);
    setFormError(null);
    try {
      await api.auth.verifyEmail(token);
      await refresh();
      queryClient.clear();
      setFormSuccess("Email đã được xác minh.");
      navigate(returnTo, { replace: true });
    } catch (caught) {
      if (isApiError(caught) && caught.code === "TOKEN_EXPIRED") {
        setFormError("Liên kết xác minh đã hết hạn. Vui lòng yêu cầu gửi lại.");
      } else {
        setFormError(isApiError(caught) ? caught.message : "Xác minh email thất bại.");
      }
    } finally {
      setPending(false);
    }
  }

  const showResend = !token;
  const showVerify = token !== null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-h1 text-ink">Xác minh email</h1>
        <p className="mt-2 t-body text-muted">
          {showVerify
            ? "Nhấn nút bên dưới để xác minh địa chỉ email của bạn. Nút này chỉ hoạt động một lần."
            : "Nhập email đã đăng ký để chúng tôi gửi lại liên kết xác minh."}
        </p>
      </div>

      {formError !== null && <InlineAlert tone="danger" title={formError} />}
      {formSuccess !== null && <InlineAlert tone="success" title={formSuccess} />}

      {showVerify && (
        <form noValidate onSubmit={(e) => { e.preventDefault(); verify(); }} className="space-y-4">
          <Button type="submit" size="lg" fullWidth loading={pending} variant="primary">
            Xác minh email
          </Button>
          <p className="t-meta text-muted text-center">
            Liên kết này chỉ sử dụng được một lần. Nếu đã hết hạn, hãy yêu cầu gửi lại bên dưới.
          </p>
        </form>
      )}

      {showResend && (
        <form noValidate onSubmit={(e) => { e.preventDefault(); sendVerification(); }} className="space-y-4">
          <FormField
            label="Email"
            htmlFor="verify-resend-email"
            required
            error={emailError ?? undefined}
          >
            <Input
              ref={emailRef}
              id="verify-resend-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="ban@example.com"
              value={verifyEmail}
              error={emailError !== null}
              aria-describedby={emailError !== null ? "verify-resend-email-error" : undefined}
              onChange={(event) => {
                setVerifyEmail(event.target.value);
                if (emailTouched) setEmailError(validateEmail(event.target.value));
                if (formError !== null) setFormError(null);
              }}
              onBlur={() => {
                setEmailTouched(true);
                setEmailError(validateEmail(verifyEmail));
              }}
            />
          </FormField>
          <Button type="submit" size="lg" fullWidth loading={pending} variant="primary">
            Gửi lại liên kết xác minh
          </Button>
          <p className="t-meta text-muted text-center">
            Nếu email có trong hệ thống, bạn sẽ nhận được hướng dẫn xác minh.
          </p>
        </form>
      )}

      <p className="t-body text-muted text-center">
        <Link
          to={viewer ? returnTo : `/login?returnTo=${encodeURIComponent(returnTo)}`}
          className="t-label text-brand hover:underline"
        >
          {viewer ? "← Quay lại" : "← Quay lại đăng nhập"}
        </Link>
      </p>
    </div>
  );
}
