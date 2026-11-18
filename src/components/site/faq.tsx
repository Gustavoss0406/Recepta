import { ChevronDown } from "lucide-react";

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-hairline border-y border-hairline">
      {items.map((it) => (
        <details key={it.q} className="group py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[0.9375rem] text-ink [&::-webkit-details-marker]:hidden">
            <h3 className="font-normal">{it.q}</h3>
            <ChevronDown size={18} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-3 max-w-2xl body-sm text-body">{it.a}</p>
        </details>
      ))}
    </div>
  );
}
