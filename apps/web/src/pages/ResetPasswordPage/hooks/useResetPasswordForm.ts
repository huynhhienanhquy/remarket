import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { validatePassword, validatePasswordConfirm } from "@remarket/shared";
import { safeReturnTo } from "@/config/route/guards";
import { apiFieldErrors, errorTitle, isApiError } from "@/helpers/errors";
import { api } from "@/services/api";
import { useValidatedField } from "@/hooks/useValidatedField";

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

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const clearFormError = () => setFormError(null);
  const { value: password, setValue: setPassword, error: passwordError, setError: setPasswordError, ref: passwordRef,
    change: changePassword, blur: blurPassword, validate: checkPassword } = useValidatedField(validatePassword, clearFormError);
  const { value: confirm, setValue: setConfirm, error: confirmError, setError: setConfirmError, ref: confirmRef,
    change: changeConfirm, blur: blurConfirm, validate: checkConfirm } = useValidatedField(
      (value) => validatePasswordConfirm(password, value), clearFormError,
    );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!token) {
      setFormError("Liên kết đặt lại mật khẩu không hợp lệ.");
      return;
    }

    const nextPasswordError = checkPassword();
    const nextConfirmError = checkConfirm();
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
        const fields = apiFieldErrors(caught);
        if (fields !== undefined) {
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
