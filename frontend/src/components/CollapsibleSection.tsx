import { ChevronDown } from "lucide-react";
import { ReactNode } from "react";
import { Card } from "./Card";
import { usePersistentDisclosure } from "../hooks/usePersistentDisclosure";

type CollapsibleSectionProps = {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  storageKey?: string;
  children: ReactNode;
};

export function CollapsibleSection({
  title,
  description,
  defaultOpen = true,
  badge,
  storageKey,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, toggleOpen] = usePersistentDisclosure(
    storageKey ?? `panel:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    defaultOpen,
  );

  return (
    <Card>
      <button
        className="flex w-full items-start justify-between gap-3 text-left"
        type="button"
        onClick={toggleOpen}
        aria-expanded={isOpen}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{title}</h2>
            {badge !== undefined && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
                {badge}
              </span>
            )}
          </div>

          {description && (
            <p className="mt-1 text-xs leading-5 text-neutral-600">
              {description}
            </p>
          )}
        </div>

        <ChevronDown
          className={[
            "mt-0.5 shrink-0 text-neutral-500 transition-transform",
            isOpen ? "rotate-180" : "",
          ].join(" ")}
          size={16}
        />
      </button>

      {isOpen && (
        <div className="mt-3 border-t border-neutral-100 pt-3">{children}</div>
      )}
    </Card>
  );
}
