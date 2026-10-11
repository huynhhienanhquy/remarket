import { PasswordInput } from "@/components/common/Input/PasswordInput";
import { useLoginForm } from "./hooks/useLoginForm";
import { Link } from "react-router-dom";
import { Button, FormField, InlineAlert, Input } from "../../components/common";

export function LoginPage() {
  const {
    email,
    password,
    emailError,
    passwordError,
    formError,
    pending,
    emailRef,
    passwordRef,
    changeEmail,
    changePassword,
    blurEmail,
    blurPassword,
    submit,
  } = useLoginForm();

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
          <PasswordInput
              ref={passwordRef}
              id="login-password"

              autoComplete="current-password"
              placeholder="Ít nhất 12 ký tự"
              value={password}
              error={passwordError !== null}
              aria-describedby={passwordError !== null ? "login-password-error" : undefined}
              className="pr-20"
              onChange={(event) => changePassword(event.target.value)}
              onBlur={blurPassword}
            />
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
