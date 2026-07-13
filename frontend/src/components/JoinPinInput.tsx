import {
  type ClipboardEvent,
  type KeyboardEvent,
  useRef,
} from "react";

type JoinPinInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
};

const PIN_LENGTH = 6;

export function JoinPinInput({
  value,
  onChange,
  disabled = false,
  invalid = false,
}: JoinPinInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: PIN_LENGTH }, (_, index) => value[index] ?? "");

  function updateDigit(index: number, nextValue: string) {
    const cleanedValue = nextValue.replace(/\D/g, "");
    if (cleanedValue.length > 1) {
      onChange(cleanedValue.slice(0, PIN_LENGTH));
      inputs.current[Math.min(cleanedValue.length, PIN_LENGTH) - 1]?.focus();
      return;
    }

    const digit = cleanedValue.slice(-1);
    const nextDigits = value.split("");
    const position = Math.min(index, nextDigits.length);

    if (digit) {
      nextDigits[position] = digit;
    } else if (position < nextDigits.length) {
      nextDigits.splice(position, 1);
    }

    onChange(nextDigits.join("").slice(0, PIN_LENGTH));

    if (digit && position < PIN_LENGTH - 1) {
      inputs.current[position + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      const nextDigits = value.split("");
      const removalIndex = Math.min(index - 1, nextDigits.length - 1);
      nextDigits.splice(removalIndex, 1);
      onChange(nextDigits.join(""));
      inputs.current[Math.max(removalIndex, 0)]?.focus();
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowRight" && index < PIN_LENGTH - 1) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pastedPin = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, PIN_LENGTH);

    if (!pastedPin) return;

    event.preventDefault();
    onChange(pastedPin);
    inputs.current[Math.min(pastedPin.length, PIN_LENGTH) - 1]?.focus();
  }

  return (
    <div
      className="grid grid-cols-6 gap-1.5"
      role="group"
      aria-label="Six-digit join PIN"
      aria-invalid={invalid}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            inputs.current[index] = element;
          }}
          className={`h-11 min-w-0 rounded-xl border bg-white text-center font-mono text-base font-semibold outline-none focus:ring-2 focus:ring-neutral-900/10 ${
            invalid
              ? "border-red-400 text-red-700 focus:border-red-600"
              : "border-neutral-300 text-neutral-900 focus:border-neutral-900"
          }`}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={`PIN digit ${index + 1}`}
          onChange={(event) => updateDigit(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.currentTarget.select()}
        />
      ))}
    </div>
  );
}
