import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { validateEmail } from "@remarket/shared";
import { useSession } from "../../contexts/SessionContext";
import { safeReturnTo } from "../../config/route/guards";
import { api } from "../../services/api";
import { Button, FormField, InlineAlert, Input } from "../../components/common";

export function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const { login: _login } = useSession();

  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);

  const returnTo = safeReturnTo(params.get("returnTo") ?? "/", "");

  function changeEmail(value: string) {
    setEmail(value);
    if (emailTouched) setEmailError(validateEmail(value));
    if (formError !== null) setFormError(null);
    if (formSuccess !== null) setFormSuccess(null);
  }

  function blurEmail() {
    setEmailTouched(true);
    setEmailError(validateEmail(email));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;

    const nextEmailError = validateEmail(email);
    setEmailTouched(true);
    setEmailError(nextEmailError);
    setFormError(null);
    setFormSuccess(null);

    if (nextEmailError !== null) {
      emailRef.current?.focus();
      return;
    }

    setPending(true);
    try {
      await api.auth.forgotPassword(email.trim());
      // Always show the same neutral message regardless of whether the email exists
      setFormSuccess("Nếu email có trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.");
    } catch {
      // Never reveal whether the email exists — always show the same message
      setFormSuccess("Nếu email có trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-h1 text-ink">Quên mật khẩu</h1>
        <p className="mt-2 t-body text-muted">
          Nhập email tài khoản của bạn. Chúng tôi sẽ gửi liên kết đặt lại mật khẩu.
        </p>
      </div>

      {formError !== null && <InlineAlert tone="danger" title={formError} />}
      {formSuccess !== null && <InlineAlert tone="success" title={formSuccess} />}

      <form noValidate onSubmit={submit} className="space-y-4">
        <FormField label="Email" htmlFor="forgot-email" required error={emailError ?? undefined}>
          <Input
            ref={emailRef}
            id="forgot-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="ban@example.com"
            value={email}
            error={emailError !== null}
            aria-describedby={emailError !== null ? "forgot-email-error" : undefined}
            onChange={(event) => changeEmail(event.target.value)}
            onBlur={blurEmail}
          />
        </FormField>

        <Button type="submit" size="lg" fullWidth loading={pending} variant="primary">
          Gửi liên kết đặt lại
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
