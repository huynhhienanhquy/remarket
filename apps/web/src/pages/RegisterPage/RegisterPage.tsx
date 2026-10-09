import { useRegisterForm } from "./hooks/useRegisterForm";
import { Link } from "react-router-dom";
import { Button, FormField, InlineAlert, Input } from "../../components/common";

export function RegisterPage() {
  const {
    fullName,
    email,
    phone,
    password,
    confirm,
    fullNameError,
    emailError,
    phoneError,
    passwordError,
    confirmError,
    formError,
    showPassword,
    setShowPassword,
    showConfirm,
    setShowConfirm,
    pending,
    fullNameRef,
    emailRef,
    phoneRef,
    passwordRef,
    confirmRef,
    returnTo,
    changeFullName,
    changeEmail,
    changePhone,
    changePassword,
    changeConfirm,
    blurFullName,
    blurEmail,
    blurPhone,
    blurPassword,
    blurConfirm,
    submit,
  } = useRegisterForm();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-h1 text-ink">Tạo tài khoản</h1>
        <p className="mt-2 t-body text-muted">
          Đăng ký để đăng tin, mua sắm và nhắn tin với người bán trên ReMarket.
        </p>
      </div>

      {formError !== null && <InlineAlert tone="danger" title={formError} />}

      <form noValidate onSubmit={submit} className="space-y-4">
        <FormField label="Họ và tên" htmlFor="reg-fullname" required error={fullNameError ?? undefined}>
          <Input
            ref={fullNameRef}
            id="reg-fullname"
            type="text"
            autoComplete="name"
            placeholder="Nguyễn Văn A"
            value={fullName}
            error={fullNameError !== null}
            aria-describedby={fullNameError !== null ? "reg-fullname-error" : undefined}
            onChange={(event) => changeFullName(event.target.value)}
            onBlur={blurFullName}
          />
        </FormField>

        <FormField label="Email" htmlFor="reg-email" required error={emailError ?? undefined}>
          <Input
            ref={emailRef}
            id="reg-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="ban@example.com"
            value={email}
            error={emailError !== null}
            aria-describedby={emailError !== null ? "reg-email-error" : undefined}
            onChange={(event) => changeEmail(event.target.value)}
            onBlur={blurEmail}
          />
        </FormField>

        <FormField label="Số điện thoại" htmlFor="reg-phone" required error={phoneError ?? undefined}>
          <Input
            ref={phoneRef}
            id="reg-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0912345678"
            value={phone}
            error={phoneError !== null}
            aria-describedby={phoneError !== null ? "reg-phone-error" : undefined}
            onChange={(event) => changePhone(event.target.value)}
            onBlur={blurPhone}
          />
        </FormField>

        <FormField
          label="Mật khẩu"
          htmlFor="reg-password"
          required
          helper="Tối thiểu 12 ký tự"
          error={passwordError ?? undefined}
        >
          <div className="relative">
            <Input
              ref={passwordRef}
              id="reg-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Tối thiểu 12 ký tự"
              value={password}
              error={passwordError !== null}
              aria-describedby={passwordError !== null ? "reg-password-error" : undefined}
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
          htmlFor="reg-confirm"
          required
          error={confirmError ?? undefined}
        >
          <div className="relative">
            <Input
              ref={confirmRef}
              id="reg-confirm"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu"
              value={confirm}
              error={confirmError !== null}
              aria-describedby={confirmError !== null ? "reg-confirm-error" : undefined}
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

        <Button type="submit" size="lg" fullWidth loading={pending}>
          Tạo tài khoản
        </Button>
      </form>

      <p className="t-body text-muted">
        Đã có tài khoản?{" "}
        <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="t-label text-brand hover:underline">
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}
