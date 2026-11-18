import { MARCAS, type MarcaId } from "@/lib/integracoes/marcas";
import { cn } from "@/lib/utils";

/** App-icon tile with an abstract composition in the integration's brand colors. */
export function MarcaIntegracao({ id, tamanho = 40, className }: { id: MarcaId; tamanho?: number; className?: string }) {
  const m = MARCAS[id];
  const [a, b, c, d] = m.cores;
  let arte: React.ReactNode;
  switch (m.padrao) {
    case "quadrantes":
      arte = (
        <>
          <rect x="9" y="9" width="10.5" height="10.5" rx="3" fill={a} />
          <rect x="20.5" y="9" width="10.5" height="10.5" rx="5.25" fill={d ?? b} />
          <rect x="9" y="20.5" width="10.5" height="10.5" rx="5.25" fill={b} />
          <rect x="20.5" y="20.5" width="10.5" height="10.5" rx="3" fill={c} />
        </>
      );
      break;
    case "orbita":
      arte = (
        <>
          <circle cx="20" cy="20" r="11.5" fill={c} />
          <circle cx="20" cy="20" r="11.5" fill="none" stroke={a} strokeWidth="3.5" strokeDasharray="56 16" strokeLinecap="round" transform="rotate(-50 20 20)" />
          <circle cx="20" cy="20" r="4.5" fill={b} />
        </>
      );
      break;
    case "faixas":
      arte = (
        <>
          <rect x="9" y="10" width="22" height="5" rx="2.5" fill={a} />
          <rect x="9" y="17.5" width="15" height="5" rx="2.5" fill={b} />
          <rect x="9" y="25" width="19" height="5" rx="2.5" fill={c} />
        </>
      );
      break;
    case "pontos":
      arte = (
        <>
          <circle cx="13" cy="20" r="3.6" fill={a} />
          <circle cx="20" cy="20" r="3.6" fill={b} />
          <circle cx="27" cy="20" r="3.6" fill={c} />
          <path d="M13 20 C 16 13, 24 13, 27 20" fill="none" stroke={a} strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
        </>
      );
      break;
    case "onda":
      arte = (
        <>
          <circle cx="20" cy="20" r="12" fill={c} />
          <path d="M8.5 22 C 12 16, 16 16, 20 21 S 28 26, 31.5 18" fill="none" stroke={a} strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="27.5" cy="13.5" r="2.6" fill={b} />
        </>
      );
      break;
  }
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center overflow-hidden", className)}
      style={{ width: tamanho, height: tamanho, borderRadius: tamanho * 0.26, background: m.fundo, boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" }}
      role="img"
      aria-label={m.nome}
    >
      <svg width={tamanho} height={tamanho} viewBox="0 0 40 40" aria-hidden>
        {arte}
      </svg>
    </span>
  );
}
