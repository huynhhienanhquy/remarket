import { fieldMessages } from "@/helpers/fieldMessages";
import { useRef, useState } from "react";
import { useEffect } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { validatePassword, validatePasswordConfirm } from "@remarket/shared";
import { safeReturnTo } from "@/config/route/guards";
import { errorTitle, isApiError } from "@/helpers/errors";
import { api } from "@/services/api";

/**
 * Keeps the reset token in memory while removing it from the URL; unsuccessful resets retain the draft.
 * Called once by the route component; hook order and handlers match the original page.
 */
export function useResetPasswordForm() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [token] = useState(() => params.get("token"));
  useEffect(() => {
    if (!params.has("token")) return;
    const next = new URLSearchParams(params); next.delete("token");
    setParams(next, { replace: true });
  }, [params, setParams]);
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
      setPassword(""); setConfirm("");
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
  return {
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
  };
}
