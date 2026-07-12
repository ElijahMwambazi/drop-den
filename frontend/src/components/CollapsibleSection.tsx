import { ChevronDown } from "lucide-react";
import { ReactNode } from "react";
import { Card } from "./Card";
import { usePersistentDisclosure } from "../hooks/usePersistentDisclosure";

type CollapsibleSectionProps = {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function CollapsibleSection({
  title,
  description,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, toggleOpen] = usePersistentDisclosure(
    `panel:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
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
          <h2 className="text-base font-semibold">{title}</h2>

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
