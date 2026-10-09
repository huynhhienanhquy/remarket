import { fieldMessages } from "@/helpers/fieldMessages";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { validateEmail, validateRequired } from "@remarket/shared";
import { useSession } from "@/contexts/SessionContext";
import { postLoginPath } from "@/config/route/guards";
import { errorTitle, isApiError } from "@/helpers/errors";

/**
 * Owns login validation and submission; cache clearing, role redirects and field focus remain unchanged.
 * Called once by the route component; hook order and handlers match the original page.
 */
export function useLoginForm() {
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
  return {
    email,
    password,
    emailError,
    passwordError,
    formError,
    showPassword,
    setShowPassword,
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
