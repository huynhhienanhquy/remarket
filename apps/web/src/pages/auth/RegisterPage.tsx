import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  validateEmail,
  validateFullName,
  validatePassword,
  validatePasswordConfirm,
  validatePhone,
} from "@remarket/shared";
import { useSession } from "../../app/SessionProvider";
import { safeReturnTo } from "../../app/guards";
import { IS_MOCK } from "../../lib/env";
import { errorTitle, isApiError } from "../../lib/errors";
import { Button, FormField, InlineAlert, Input } from "../../components/ui";

const DEMO_PASSWORD = "remarket-demo-2026";

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

export function RegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const { register } = useSession();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [fullNameTouched, setFullNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending] = useState(false);

  const fullNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const returnTo = safeReturnTo(params.get("returnTo") ?? "/", "");

  function changeFullName(value: string) {
    setFullName(value);
    if (fullNameTouched) setFullNameError(validateFullName(value));
    if (formError !== null) setFormError(null);
  }

  function changeEmail(value: string) {
    setEmail(value);
    if (emailTouched) setEmailError(validateEmail(value));
    if (formError !== null) setFormError(null);
  }

  function changePhone(value: string) {
    setPhone(value);
    if (phoneTouched) setPhoneError(validatePhone(value));
    if (formError !== null) setFormError(null);
  }

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

  function blurFullName() {
    setFullNameTouched(true);
    setFullNameError(validateFullName(fullName));
  }

  function blurEmail() {
    setEmailTouched(true);
    setEmailError(validateEmail(email));
  }

  function blurPhone() {
    setPhoneTouched(true);
    setPhoneError(validatePhone(phone));
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

    const nextFullNameError = validateFullName(fullName);
    const nextEmailError = validateEmail(email);
    const nextPhoneError = validatePhone(phone);
    const nextPasswordError = validatePassword(password);
    const nextConfirmError = validatePasswordConfirm(password, confirm);

    setFullNameTouched(true);
    setEmailTouched(true);
    setPhoneTouched(true);
    setPasswordTouched(true);
    setConfirmTouched(true);

    setFullNameError(nextFullNameError);
    setEmailError(nextEmailError);
    setPhoneError(nextPhoneError);
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    setFormError(null);

    if (nextFullNameError !== null) {
      fullNameRef.current?.focus();
      return;
    }
    if (nextEmailError !== null) {
      emailRef.current?.focus();
      return;
    }
    if (nextPhoneError !== null) {
      phoneRef.current?.focus();
      return;
    }
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
      const result = await register({
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        confirm_password: confirm,
      });
      if (result.pending_verification) {
        queryClient.clear();
        navigate(`/verify-email?email=${encodeURIComponent(email.trim())}&returnTo=${encodeURIComponent(returnTo)}`, {
          replace: true,
        });
      } else {
        queryClient.clear();
        navigate(returnTo, { replace: true });
      }
    } catch (caught) {
      if (isApiError(caught) && caught.isNetwork) {
        setFormError("Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.");
      } else if (isApiError(caught)) {
        const fields = fieldMessages(caught);
        if (fields !== null) {
          if (fields.full_name !== undefined) {
            setFullNameError(fields.full_name);
            fullNameRef.current?.focus();
          } else if (fields.email !== undefined) {
            setEmailError(fields.email);
            emailRef.current?.focus();
          } else if (fields.phone !== undefined) {
            setPhoneError(fields.phone);
            phoneRef.current?.focus();
          } else if (fields.password !== undefined) {
            setPasswordError(fields.password);
            passwordRef.current?.focus();
          } else if (fields.confirm !== undefined) {
            setConfirmError(fields.confirm);
            confirmRef.current?.focus();
          }
        }
        setFormError(caught.message || "Không đăng ký được tài khoản");
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

      {IS_MOCK && (
        <section
          aria-labelledby="demo-accounts-title"
          className="rounded-card border border-dashed border-line bg-surface-subtle p-4"
        >
          <h2 id="demo-accounts-title" className="t-label text-ink">
            Tài khoản demo (dữ liệu mẫu)
          </h2>
          <p className="mt-1 t-meta text-muted">
            Chỉ hiện khi VITE_API_MODE=mock. Mật khẩu chung: {DEMO_PASSWORD}. Chọn một tài khoản
            để điền vào biểu mẫu.
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
                    setPassword(DEMO_PASSWORD);
                    setConfirm(DEMO_PASSWORD);
                    setFullNameTouched(false);
                    setEmailTouched(false);
                    setPhoneTouched(false);
                    setPasswordTouched(false);
                    setConfirmTouched(false);
                    setFullNameError(null);
                    setEmailError(null);
                    setPhoneError(null);
                    setPasswordError(null);
                    setConfirmError(null);
                    setFormError(null);
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