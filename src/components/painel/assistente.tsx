"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Sparkles, TriangleAlert } from "lucide-react";
import { acaoAplicarMudancas, acaoProporMudancas, type Resultado, type ResultadoAssistente } from "@/app/painel/actions";
import { BOTAO } from "@/components/painel/page-header";
import { cn } from "@/lib/utils";

const EXEMPLOS = {
  criar: [
    "Sou dentista em Campinas, atendo Unimed e particular. Quero que ela marque avaliação e passe pedidos de orçamento para mim.",
    "Restaurante italiano, abre de terça a domingo das 18h às 23h. Ela anota reservas e avisa que não temos estacionamento.",
  ],
  ajustar: [
    "Quando perguntarem preço de implante, passe o caso para mim.",
    "Peça o CPF e a data de nascimento antes de agendar.",
    "Deixe a saudação mais simpática e use o nome Lia.",
  ],
};

/**
 * Configuration assistant: one plain-language request → changes proposed per section, each shown
 * as before/after and applied only when the business approves it.
 */
export function Assistente({ agenteId, modo = "ajustar", className }: { agenteId: string; modo?: "criar" | "ajustar"; className?: string }) {
  const [pedido, setPedido] = useState("");
  const [r, setR] = useState<ResultadoAssistente>(undefined);
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [fim, setFim] = useState<Resultado>(undefined);
  const [pensando, iniciar] = useTransition();
  const [aplicando, iniciarAplicar] = useTransition();

  const propor = () =>
    iniciar(async () => {
      setFim(undefined);
      const res = await acaoProporMudancas(agenteId, pedido);
      setR(res);
      setEscolhidas(res?.secoes?.filter((s) => !s.aviso || s.antes.join() !== s.depois.join()).map((s) => s.id) ?? []);
    });
  const aplicar = () =>
    iniciarAplicar(async () => {
      const res = await acaoAplicarMudancas(agenteId, r?.proposta, escolhidas);
      setFim(res);
      if (res?.ok) {
        setR(undefined);
        setPedido("");
      }
    });

  return (
    <section className={cn("rounded-[18px] border border-border bg-background p-4", className)} aria-label="Assistente de configuração">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-foreground text-white">
          <Sparkles size={14} />
        </span>
        <div>
          <h2 className="text-[0.9375rem] font-medium text-foreground">{modo === "criar" ? "Conte sobre o seu negócio" : "Ajustar com o assistente"}</h2>
          <p className="text-xs text-muted-foreground">
            {modo === "criar" ? "Em poucas frases. Montamos a recepcionista e você revisa cada parte." : "Peça a mudança com suas palavras. Nada muda até você aprovar."}
          </p>
        </div>
      </div>

      <textarea
        value={pedido}
        onChange={(e) => setPedido(e.target.value)}
        rows={modo === "criar" ? 4 : 3}
        maxLength={2000}
        placeholder={EXEMPLOS[modo][0]}
        className="field mt-3 min-h-0 resize-y py-2 leading-relaxed"
        aria-label="Seu pedido"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && pedido.trim()) propor();
        }}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXEMPLOS[modo].map((x) => (
          <button key={x} type="button" onClick={() => setPedido(x)} className="max-w-full truncate rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
            {x}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={propor} disabled={pensando || pedido.trim().length < 8} className={cn(BOTAO.primario, "h-8 px-3")}>
          {pensando ? "Montando proposta…" : "Ver proposta"} {!pensando && <ArrowRight size={14} />}
        </button>
        {fim && <span className={cn("text-sm", fim.erro ? "text-[#b42318]" : "text-[#147a3d]")}>{fim.erro ?? fim.mensagem}</span>}
      </div>

      {r?.erro && <p className="mt-3 rounded-[10px] bg-[#fdecec] px-3 py-2 text-sm text-[#b42318]">{r.erro}</p>}

      {r?.secoes && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-foreground">{r.resumo}</p>
          <ul className="space-y-2">
            {r.secoes.map((s) => {
              const marcado = escolhidas.includes(s.id);
              const novos = s.depois.filter((l) => !s.antes.includes(l));
              const saem = s.antes.filter((l) => !s.depois.includes(l));
              return (
                <li key={s.id} className={cn("rounded-[14px] border p-3 transition-colors", marcado ? "border-foreground/30 bg-muted/40" : "border-border")}>
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={(e) => setEscolhidas((v) => (e.target.checked ? [...v, s.id] : v.filter((x) => x !== s.id)))}
                      className="size-4 accent-foreground"
                    />
                    <span className="text-sm font-medium text-foreground">{s.titulo}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {novos.length ? `+${novos.length}` : ""} {saem.length ? `−${saem.length}` : ""}
                    </span>
                  </label>
                  {s.aviso && (
                    <p className="mt-2 flex gap-1.5 text-xs text-[#9a6700]">
                      <TriangleAlert size={13} className="mt-px shrink-0" /> {s.aviso}
                    </p>
                  )}
                  <ul className="mt-2 space-y-0.5 pl-6 text-[0.8125rem] leading-relaxed">
                    {saem.map((l) => (
                      <li key={`-${l}`} className="text-muted-foreground line-through decoration-[#e5484d]/60">
                        {l}
                      </li>
                    ))}
                    {novos.map((l) => (
                      <li key={`+${l}`} className="text-foreground">
                        <span className="mr-1 text-[#22a35a]">+</span>
                        {l}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={aplicar} disabled={aplicando || !escolhidas.length} className={cn(BOTAO.primario, "h-8 px-3")}>
              {aplicando ? "Aplicando…" : `Aplicar ${escolhidas.length} de ${r.secoes.length}`}
            </button>
            <button type="button" onClick={() => setR(undefined)} className={cn(BOTAO.fantasma, "h-8 px-3")}>
              Descartar
            </button>
            <span className="text-xs text-muted-foreground">Vai para o rascunho. A versão publicada só muda quando você publicar.</span>
          </div>
        </div>
      )}
    </section>
  );
}
