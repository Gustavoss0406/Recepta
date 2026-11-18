import { FlaskConical, Headset, TriangleAlert, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export type OrigemRepasse = "agente" | "automatico" | "teste" | "manual";
export type StatusRepasse = "pendente" | "em_andamento" | "resolvido";
export type UrgenciaRepasse = "baixa" | "media" | "alta";

export const ORIGEM: Record<OrigemRepasse, { texto: string; classe: string; icon: typeof Headset }> = {
  agente: { texto: "Repassado pela recepcionista", classe: "bg-[#eaf1fe] text-[#1d4fd7]", icon: Headset },
  automatico: { texto: "Ligação não resolvida", classe: "bg-[#fdf0e7] text-[#a4410b]", icon: TriangleAlert },
  teste: { texto: "Execução de teste", classe: "bg-[#e9f7ef] text-[#147a3d]", icon: FlaskConical },
  manual: { texto: "Criado pela equipe", classe: "bg-[#f2f2f2] text-[#525252]", icon: UserRound },
};

export const STATUS: Record<StatusRepasse, { texto: string; classe: string }> = {
  pendente: { texto: "Pendente", classe: "bg-[#fdf6d8] text-[#7a5b00]" },
  em_andamento: { texto: "Em andamento", classe: "bg-[#eaf1fe] text-[#1d4fd7]" },
  resolvido: { texto: "Resolvido", classe: "bg-[#e9f7ef] text-[#147a3d]" },
};

export const URGENCIA: Record<UrgenciaRepasse, { texto: string; cor: string }> = {
  alta: { texto: "Alta", cor: "#e5484d" },
  media: { texto: "Média", cor: "#f5a524" },
  baixa: { texto: "Baixa", cor: "#a3a3a3" },
};

export function BadgeOrigem({ origem, compacto }: { origem: OrigemRepasse; compacto?: boolean }) {
  const o = ORIGEM[origem];
  const Icon = o.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[0.75rem] leading-4 font-medium whitespace-nowrap", o.classe)}>
      <Icon size={12} strokeWidth={2} aria-hidden />
      {compacto ? o.texto.split(" ")[0] : o.texto}
    </span>
  );
}

export function BadgeStatus({ status }: { status: StatusRepasse }) {
  const s = STATUS[status];
  return <span className={cn("inline-flex rounded-[6px] px-1.5 py-0.5 text-[0.75rem] leading-4 font-medium whitespace-nowrap", s.classe)}>{s.texto}</span>;
}

export function Urgencia({ urgencia }: { urgencia: UrgenciaRepasse }) {
  const u = URGENCIA[urgencia];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
      <span className="size-2 rounded-full" style={{ background: u.cor }} aria-hidden />
      {u.texto}
    </span>
  );
}

export function Avatar({ nome, className }: { nome: string; className?: string }) {
  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full bg-[#ececec] text-[0.625rem] font-medium text-[#404040]", className)} aria-hidden>
      {iniciais || "?"}
    </span>
  );
}

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
export function dataCurta(d: Date): string {
  return fmt.format(d).replace(".", "");
}
