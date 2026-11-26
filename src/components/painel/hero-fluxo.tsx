import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { fotos } from "@/server/fotos";
import { MODELOS } from "@/lib/fotos";
import { PromptFluxo } from "./prompt-fluxo";

/** Faded node card drawn behind the hero (decorative). */
function NoFantasma({ x, y, rotulo, titulo, foto }: { x: string; y: string; rotulo: string; titulo: string; foto?: string }) {
  return (
    <div className="absolute w-44 rounded-[14px] border border-border bg-white p-2 shadow-[0_6px_18px_rgba(0,0,0,.06)]" style={{ left: x, top: y }}>
      <p className="flex justify-between text-[9px] tracking-wide text-muted-foreground uppercase">
        <span>{rotulo}</span>
        <span>Recepta</span>
      </p>
      {foto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt="" className="mt-1.5 aspect-[16/9] w-full rounded-[8px] object-cover" />
      )}
      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{titulo}</p>
    </div>
  );
}

/** ElevenLabs-Flows-style hero for the Workflow tab: faded canvas, title, prompt and templates. */
export async function HeroFluxo({ agenteId }: { agenteId: string }) {
  const F = await fotos(MODELOS.map((m) => m.slug));
  const f = (s: string) => F[s]?.src;
  return (
    <div className="mb-6">
      <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-b from-[#f4f4f5] to-white px-4 pt-12 pb-10 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden opacity-[0.28] blur-[0.5px] md:block">
          <NoFantasma x="3%" y="18%" rotulo="Etapa" titulo="Entender o que o cliente precisa" foto={f("clinica")} />
          <NoFantasma x="19%" y="4%" rotulo="Ação" titulo="Consultar horários livres" foto={f("salao")} />
          <NoFantasma x="17%" y="58%" rotulo="Condição" titulo="Dentro do horário?" />
          <NoFantasma x="70%" y="6%" rotulo="Etapa" titulo="Apresentar opções de imóvel" foto={f("imobiliaria")} />
          <NoFantasma x="84%" y="34%" rotulo="Ação" titulo="Marcar na agenda" foto={f("restaurante")} />
          <NoFantasma x="68%" y="62%" rotulo="Falar" titulo="Te mandei a confirmação no WhatsApp" />
          <svg className="absolute inset-0 size-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <path d="M14 30 C 30 20, 40 45, 50 48" stroke="#93c5fd" strokeWidth=".25" fill="none" />
            <path d="M28 14 C 40 10, 60 12, 72 16" stroke="#93c5fd" strokeWidth=".25" fill="none" />
            <path d="M50 52 C 62 55, 76 60, 86 44" stroke="#93c5fd" strokeWidth=".25" fill="none" />
            <path d="M26 66 C 40 70, 56 72, 70 70" stroke="#93c5fd" strokeWidth=".25" fill="none" />
          </svg>
        </div>
        <div className="relative">
          <p className="text-sm text-muted-foreground">Fluxo de atendimento</p>
          <h2 className="mx-auto mt-2 max-w-xl text-[1.625rem] leading-tight font-medium tracking-[-0.025em] sm:text-[2rem]">Monte cada ligação do alô à despedida, num canvas</h2>
          <PromptFluxo agenteId={agenteId} />
          <Link href="/painel/comecar?conversa=1" className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <MessagesSquare size={14} /> ou refaça o fluxo conversando com a Recepta
          </Link>
        </div>
      </section>

      <div className="mt-8 flex items-end justify-between">
        <p className="text-[0.9375rem] font-medium">Comece de um modelo</p>
        <a href="#editor-fluxo" className="text-sm text-muted-foreground hover:text-foreground">
          Ir para o meu fluxo ↓
        </a>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {MODELOS.slice(0, 4).map((m) => (
          <Link key={m.slug} href={`/painel/comecar?conversa=1&negocio=${encodeURIComponent(m.negocio)}`} className="group block">
            <span className="block aspect-[16/10] overflow-hidden rounded-[16px] border border-border bg-muted">
              {f(m.slug) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f(m.slug)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
              )}
            </span>
            <span className="mt-2 block text-sm">{m.titulo}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
