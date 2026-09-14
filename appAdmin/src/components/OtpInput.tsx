import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

type OtpInputProps = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
};

export type OtpInputRef = {
  focus: () => void;
};

export const OtpInput = forwardRef<OtpInputRef, OtpInputProps>(function OtpInput(
  { length = 6, value, onChange, onComplete, disabled, autoFocus },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const prevLength = useRef(0);
  const [focused, setFocused] = useState(false);

  const digits = value.padEnd(length, ' ').split('').slice(0, length);
  const activeIndex = Math.min(value.length, length - 1);

  const focusInput = useCallback(() => {
    if (disabled) return;
    inputRef.current?.focus();
  }, [disabled]);

  useImperativeHandle(ref, () => ({ focus: focusInput }));

  useEffect(() => {
    if (!autoFocus) return;
    const timer = window.setTimeout(focusInput, 350);
    return () => window.clearTimeout(timer);
  }, [autoFocus, focusInput]);

  useEffect(() => {
    if (value.length === length && prevLength.current < length) {
      onComplete?.(value);
    }
    prevLength.current = value.length;
  }, [value, length, onComplete]);

  return (
    <div
      role="group"
      onClick={focusInput}
      className={`relative w-full ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-text'}`}
    >
      <div className="pointer-events-none flex w-full gap-2" aria-hidden="true">
        {digits.map((digit, index) => {
          const isActive = focused && index === activeIndex && value.length < length;
          return (
            <div
              key={index}
              className={`flex h-12 flex-1 items-center justify-center rounded-lg border text-xl font-semibold ${
                isActive ? 'border-green-600 ring-2 ring-green-100' : 'border-slate-200 bg-white'
              }`}
            >
              {digit.trim() || ''}
            </div>
          );
        })}
      </div>
      <input
        ref={inputRef}
        inputMode="numeric"
        autoComplete="one-time-code"
        className="absolute inset-0 h-full w-full opacity-0"
        value={value}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
      />
    </div>
  );
});
