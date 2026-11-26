import { useRef, useState } from "react";

/** Shared draft, blur validation and submit validation for text inputs. */
export function useValidatedField(
  validateValue: (value: string) => string | null,
  onChange: () => void,
) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  function change(next: string) {
    setValue(next);
    if (touched) setError(validateValue(next));
    onChange();
  }

  function validate() {
    const result = validateValue(value);
    setTouched(true);
    setError(result);
    return result;
  }

  return { value, setValue, error, setError, ref, change, blur: () => { validate(); }, validate };
}
