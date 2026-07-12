import { useCallback, useState } from "react";

const STORAGE_PREFIX = "drop-den-disclosure:";

export function usePersistentDisclosure(key: string, defaultOpen = false) {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const [isOpen, setIsOpen] = useState(() => {
    try {
      const savedValue = localStorage.getItem(storageKey);
      if (savedValue === "open") return true;
      if (savedValue === "closed") return false;
    } catch {
      // Fall back to the component default when storage is unavailable.
    }

    return defaultOpen;
  });

  const toggle = useCallback(() => {
    setIsOpen((current) => {
      const next = !current;

      try {
        localStorage.setItem(storageKey, next ? "open" : "closed");
      } catch {
        // The disclosure still works for this session without persistence.
      }

      return next;
    });
  }, [storageKey]);

  return [isOpen, toggle] as const;
}
