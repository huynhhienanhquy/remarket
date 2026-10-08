import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { validateEmail } from "@remarket/shared";
import { useSession } from "../../app/SessionProvider";
import { safeReturnTo } from "../../app/guards";
import { IS_MOCK } from "../../lib/env";
import { api } from "../../lib/api";
import { Button, FormField, InlineAlert, Input } from "../../components/ui";

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

      {IS_MOCK && (
        <section
          aria-labelledby="demo-accounts-title"
          className="rounded-card border border-dashed border-line bg-surface-subtle p-4"
        >
          <h2 id="demo-accounts-title" className="t-label text-ink">
            Tài khoản demo (dữ liệu mẫu)
          </h2>
          <p className="mt-1 t-meta text-muted">
            Chỉ hiện khi VITE_API_MODE=mock. Mật khẩu chung: <code>remarket-demo-2026</code>. Chọn
            một tài khoản để điền email vào biểu mẫu.
          </p>
          <ul className="mt-3 space-y-2">
            {[
              { email: "anh.mua@remarket.vn", note: "Người dùng ACTIVE, đã xác minh email" },
              { email: "lan.ban@remarket.vn", note: "Người bán ACTIVE, đã xác minh email" },
              { email: "admin@remarket.vn", note: "Quản trị viên (ADMIN)" },
              { email: "vy.moi@remarket.vn", note: "Tài khoản chưa xác minh email" },
              { email: "long.bi.khoa@remarket.vn", note: "Tài khoản bị khóa (LOCKED)" },
            ].map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setEmailTouched(false);
                    setEmailError(null);
                    setFormError(null);
                    setFormSuccess(null);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-control border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <span className="min-w-0">
                    <span className="block truncate t-meta text-ink">{account.email}</span>
                    <span className="block t-meta text-muted">{account.note}</span>
                  </span>
                  <span className="shrink-0 t-meta text-brand">Điền</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}