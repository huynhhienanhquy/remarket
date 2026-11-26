import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  validateEmail,
  validateFullName,
  validatePassword,
  validatePasswordConfirm,
  validatePhone,
} from "@remarket/shared";
import { useSession } from "@/contexts/SessionContext";
import { safeReturnTo } from "@/config/route/guards";
import { apiFieldErrors, errorTitle, isApiError } from "@/helpers/errors";
import { useValidatedField } from "@/hooks/useValidatedField";

/**
 * Owns registration drafts and validation; pending verification keeps the existing return URL.
 * Called once by the route component; hook order and handlers match the original page.
 */
export function useRegisterForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const { register } = useSession();

  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const clearFormError = () => setFormError(null);
  const { value: fullName, error: fullNameError, setError: setFullNameError, ref: fullNameRef,
    change: changeFullName, blur: blurFullName, validate: checkFullName } = useValidatedField(validateFullName, clearFormError);
  const { value: email, error: emailError, setError: setEmailError, ref: emailRef,
    change: changeEmail, blur: blurEmail, validate: checkEmail } = useValidatedField(validateEmail, clearFormError);
  const { value: phone, error: phoneError, setError: setPhoneError, ref: phoneRef,
    change: changePhone, blur: blurPhone, validate: checkPhone } = useValidatedField(validatePhone, clearFormError);
  const { value: password, error: passwordError, setError: setPasswordError, ref: passwordRef,
    change: changePassword, blur: blurPassword, validate: checkPassword } = useValidatedField(validatePassword, clearFormError);
  const { value: confirm, error: confirmError, setError: setConfirmError, ref: confirmRef,
    change: changeConfirm, blur: blurConfirm, validate: checkConfirm } = useValidatedField(
      (value) => validatePasswordConfirm(password, value), clearFormError,
    );

  const returnTo = safeReturnTo(params.get("returnTo") ?? "/", "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;

    const nextFullNameError = checkFullName();
    const nextEmailError = checkEmail();
    const nextPhoneError = checkPhone();
    const nextPasswordError = checkPassword();
    const nextConfirmError = checkConfirm();

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
      await register({
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        confirm_password: confirm,
      });
      queryClient.clear();
      navigate(`/verify-email?email=${encodeURIComponent(email.trim())}&returnTo=${encodeURIComponent(returnTo)}`, {
        replace: true,
      });
    } catch (caught) {
      if (isApiError(caught) && caught.isNetwork) {
        setFormError("Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.");
      } else if (isApiError(caught)) {
        const fields = apiFieldErrors(caught);
        if (fields !== undefined) {
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
  return {
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
  };
}
