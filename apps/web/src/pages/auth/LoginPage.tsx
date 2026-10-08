import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { validateEmail, validateRequired } from "@remarket/shared";
import { useSession } from "../../app/SessionProvider";
import { postLoginPath } from "../../app/guards";
import { errorTitle, isApiError } from "../../lib/errors";
import { Button, FormField, InlineAlert, Input } from "../../components/ui";

/** 422 payloads expose field messages from the API envelope. */
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

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const { login } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const returnTo = params.get("returnTo");

  function changeEmail(value: string) {
    setEmail(value);
    if (emailTouched) setEmailError(validateEmail(value));
    if (formError !== null) setFormError(null);
  }

  function changePassword(value: string) {
    setPassword(value);
    if (passwordTouched) setPasswordError(validateRequired(value, "Mật khẩu"));
    if (formError !== null) setFormError(null);
  }

  function blurEmail() {
    setEmailTouched(true);
    setEmailError(validateEmail(email));
  }

  function blurPassword() {
    setPasswordTouched(true);
    setPasswordError(validateRequired(password, "Mật khẩu"));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;

    const nextEmailError = validateEmail(email);
    const nextPasswordError = validateRequired(password, "Mật khẩu");
    setEmailTouched(true);
    setPasswordTouched(true);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);
    if (nextEmailError !== null) {
      emailRef.current?.focus();
      return;
    }
    if (nextPasswordError !== null) {
      passwordRef.current?.focus();
      return;
    }

    setPending(true);
    try {
      const user = await login(email.trim(), password);
      // Session changed: drop cached responses that may embed the previous
      // viewer so no private data leaks across accounts (ui-spec 24).
      queryClient.clear();
      navigate(postLoginPath(user, returnTo), { replace: true });
    } catch (caught) {
      if (isApiError(caught) && caught.isNetwork) {
        setFormError("Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.");
      } else if (isApiError(caught)) {
        const fields = fieldMessages(caught);
        if (fields !== null) {
          if (fields.email !== undefined) {
            setEmailError(fields.email);
            emailRef.current?.focus();
          } else if (fields.password !== undefined) {
            setPasswordError(fields.password);
            passwordRef.current?.focus();
          }
        }
        setFormError(caught.message || "Email hoặc mật khẩu không đúng");
      } else {
        setFormError(errorTitle(caught));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-h1 text-ink">Đăng nhập</h1>
        <p className="mt-2 t-body text-muted">
          Đăng nhập để mua bán hoặc quản trị ReMarket theo quyền tài khoản.
        </p>
      </div>

      {formError !== null && <InlineAlert tone="danger" title={formError} />}

      <form noValidate onSubmit={submit} className="space-y-4">
        <FormField label="Email" htmlFor="login-email" required error={emailError ?? undefined}>
          <Input
            ref={emailRef}
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="ban@example.com"
            value={email}
            error={emailError !== null}
            aria-describedby={emailError !== null ? "login-email-error" : undefined}
            onChange={(event) => changeEmail(event.target.value)}
            onBlur={blurEmail}
          />
        </FormField>

        <FormField
          label="Mật khẩu"
          htmlFor="login-password"
          required
          error={passwordError ?? undefined}
        >
          <div className="relative">
            <Input
              ref={passwordRef}
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Ít nhất 12 ký tự"
              value={password}
              error={passwordError !== null}
              aria-describedby={passwordError !== null ? "login-password-error" : undefined}
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

        <div className="flex justify-end">
          <Link to="/forgot-password" className="t-label text-brand hover:underline">
            Quên mật khẩu?
          </Link>
        </div>

        <Button type="submit" size="lg" fullWidth loading={pending}>
          Đăng nhập
        </Button>
      </form>

      <p className="t-body text-muted">
        Chưa có tài khoản?{" "}
        <Link to="/register" className="t-label text-brand hover:underline">
          Đăng ký ngay
        </Link>
      </p>
    </div>
  );
}
