import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { validateEmail, validateRequired } from "@remarket/shared";
import { useSession } from "@/contexts/SessionContext";
import { postLoginPath } from "@/config/route/guards";
import { apiFieldErrors, errorTitle, isApiError } from "@/helpers/errors";
import { useValidatedField } from "@/hooks/useValidatedField";

/**
 * Owns login validation and submission; cache clearing, role redirects and field focus remain unchanged.
 * Called once by the route component; hook order and handlers match the original page.
 */
export function useLoginForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const { login } = useSession();

  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const clearFormError = () => setFormError(null);
  const { value: email, error: emailError, setError: setEmailError, ref: emailRef,
    change: changeEmail, blur: blurEmail, validate: checkEmail } = useValidatedField(validateEmail, clearFormError);
  const { value: password, error: passwordError, setError: setPasswordError, ref: passwordRef,
    change: changePassword, blur: blurPassword, validate: checkPassword } = useValidatedField(
      (value) => validateRequired(value, "Mật khẩu"), clearFormError,
    );

  const returnTo = params.get("returnTo");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;

    const nextEmailError = checkEmail();
    const nextPasswordError = checkPassword();
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
        const fields = apiFieldErrors(caught);
        if (fields !== undefined) {
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
  return {
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
  };
}
