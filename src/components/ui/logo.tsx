import { brand } from "@/config/brand";
import { MARCA_PATH, MARCA_VIEWBOX } from "./marca-path";

/** Brand symbol alone (avatars, favicon-like spots). */
export function Marca({ tamanho = 22, className = "" }: { tamanho?: number; className?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox={MARCA_VIEWBOX} aria-hidden="true" className={className}>
      <path fill="currentColor" fillRule="evenodd" d={MARCA_PATH} />
    </svg>
  );
}

/** Wordmark: the brand symbol + the brand name. */
export function Logo({ className = "" }: { className?: string; onDark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Marca tamanho={22} />
      <span className="font-display text-[1.45rem] leading-none font-medium tracking-[-0.03em]">{brand.name}</span>
    </span>
  );
}
