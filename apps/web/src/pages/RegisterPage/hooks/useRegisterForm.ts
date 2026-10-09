import { fieldMessages } from "@/helpers/fieldMessages";
import { useRef, useState } from "react";
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
import { errorTitle, isApiError } from "@/helpers/errors";

/**
 * Owns registration drafts and validation; pending verification keeps the existing return URL.
 * Called once by the route component; hook order and handlers match the original page.
 */
export function useRegisterForm() {
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
  };
}
