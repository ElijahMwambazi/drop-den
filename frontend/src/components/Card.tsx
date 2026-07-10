import type { ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
      {children}
    </section>
  );
}
