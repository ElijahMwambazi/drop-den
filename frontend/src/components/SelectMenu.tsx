import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
};

type SelectMenuProps<T extends string> = {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
};

export function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: SelectMenuProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    window.addEventListener("mousedown", closeOnOutsideClick);
    return () => window.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        type="button"
        className="flex w-full min-w-32 items-center justify-between gap-3 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-left text-xs outline-none hover:border-neutral-400 focus:border-neutral-900"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDown
          className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          size={14}
        />
      </button>

      {isOpen && (
        <div
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl"
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${
                option.value === value
                  ? "bg-neutral-950 text-white"
                  : "text-neutral-700 hover:bg-neutral-100"
              }`}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
