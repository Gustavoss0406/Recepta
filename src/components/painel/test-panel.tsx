"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CalendarCheck, FileText, Flag, MessageCircle, PhoneForwarded, PhoneOff, RotateCcw, Search, Send } from "lucide-react";
import { testeEncerrar, testeIniciar, testeResponder } from "@/app/painel/teste-actions";
import { Orb } from "@/components/ui/orb";
import { VoiceTest } from "./voice-test";

type Item =
  | { tipo: "agente" | "cliente"; texto: string }
  | { tipo: "acao"; nome: string; ok: boolean; detalhe: string };

const ROTULO: Record<string, { texto: string; icon: typeof Search }> = {
  consultar_horarios: { texto: "Consultou a agenda", icon: Search },
  agendar: { texto: "Agendou", icon: CalendarCheck },
  transferir_para_humano: { texto: "Transferência", icon: PhoneForwarded },
  anotar_recado: { texto: "Anotou recado", icon: FileText },
  enviar_whatsapp: { texto: "WhatsApp enviado", icon: MessageCircle },
  sinalizar_revisao: { texto: "Sinalizou para revisão", icon: Flag },
  encerrar_ligacao: { texto: "Encerrou a ligação", icon: PhoneOff },
};

function detalheAcao(nome: string, r: Record<string, unknown>): string {
  if (nome === "consultar_horarios") {
    const h = (r.horarios as { rotulo: string }[]) ?? [];
    return h.length ? h.map((x) => x.rotulo).join(" · ") : "Nenhum horário livre";
  }
  if (nome === "agendar") return r.ok ? String(r.rotulo) : `Falhou: ${String(r.erro)}`;
  if (nome === "transferir_para_humano") return r.ok ? `Para ${String(r.numero)}` : `Não transferiu: ${String(r.motivo)}`;
  return r.ok === false ? "Falhou" : "";
}

export interface ResumoFinal {
  resultado: string | null;
  resumo: string | null;
  dados: Record<string, string> | null;
  avaliacao: { sucesso: boolean; justificativa: string } | null;
  duracaoS: number;
}

/** Side panel "Testar": text chat (and voice) against the draft, with the tool timeline. */
export function TestPanel({ agenteId, vozDisponivel = true }: { agenteId: string; vozDisponivel?: boolean }) {
  const [modo, setModo] = useState<"texto" | "voz">("texto");
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [texto, setTexto] = useState("");
  const [demo, setDemo] = useState(false);
  const [fim, setFim] = useState<ResumoFinal | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const lista = useRef<HTMLOListElement>(null);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [itens, fim]);

  function comecar() {
    setErro(null);
    setFim(null);
    iniciar(async () => {
      try {
        const r = await testeIniciar(agenteId, "teste_texto");
        setConversaId(r.conversaId);
        setDemo(r.modoDemo);
        setItens([{ tipo: "agente", texto: r.saudacao }]);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao iniciar");
      }
    });
  }

  function encerrar(id = conversaId) {
    if (!id) return;
    iniciar(async () => {
      const r = await testeEncerrar(id);
      setFim(r);
      setConversaId(null);
    });
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || !conversaId) return;
    setTexto("");
    setItens((x) => [...x, { tipo: "cliente", texto: t }]);
    iniciar(async () => {
      try {
        const r = await testeResponder(conversaId, t);
        const novos: Item[] = [];
        r.acoes.forEach((a) => novos.push({ tipo: "acao", nome: a.nome, ok: a.resultado.ok !== false, detalhe: detalheAcao(a.nome, a.resultado) }));
        if (r.falas.length) novos.push({ tipo: "agente", texto: r.falas.join(" ") });
        setItens((x) => [...x, ...novos]);
        if (r.encerrar) encerrar(conversaId);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <div role="tablist" aria-label="Modo de teste" className="flex gap-1 rounded-full bg-white p-1 shadow-[var(--shadow-pill)]">
          {(["texto", "voz"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={modo === m}
              onClick={() => setModo(m)}
              disabled={m === "voz" && !vozDisponivel}
              className={`h-7 rounded-full px-3 text-xs capitalize disabled:opacity-40 ${modo === m ? "bg-ink text-white" : "text-body"}`}
            >
              {m}
            </button>
          ))}
        </div>
        {modo === "texto" && (conversaId || fim) && (
          <button type="button" onClick={() => (conversaId ? encerrar() : comecar())} className="btn btn-sm btn-secondary !h-8 text-xs">
            {conversaId ? (
              <>
                <PhoneOff size={13} /> Encerrar
              </>
            ) : (
              <>
                <RotateCcw size={13} /> Nova conversa
              </>
            )}
          </button>
        )}
      </div>

      {modo === "voz" ? (
        <VoiceTest agenteId={agenteId} />
      ) : (
        <>
          {demo && (
            <p className="mx-4 mt-3 rounded-[10px] bg-[#fff6e5] px-3 py-2 text-xs text-[#8a5a00]">
              Modo demonstração: respostas roteirizadas. Configure ANTHROPIC_API_KEY para conversar com a recepcionista de verdade.
            </p>
          )}
          <ol ref={lista} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4" aria-live="polite">
            {!conversaId && !fim && itens.length === 0 && (
              <li className="flex h-full flex-col items-center justify-center gap-5 py-10 text-center">
                <Orb tom="padrao" tamanho={96} />
                <div>
                  <p className="text-[0.9375rem] text-ink">Converse com o rascunho do agente</p>
                  <p className="mt-1 text-sm text-muted-foreground">Agendamentos de teste vão para uma agenda simulada.</p>
                </div>
                <button type="button" onClick={comecar} disabled={pendente} className="btn btn-sm btn-primary">
                  Começar teste
                </button>
              </li>
            )}
            {itens.map((it, i) =>
              it.tipo === "acao" ? (
                <li key={i} className="flex justify-center">
                  <span className={`badge !text-xs ${it.ok ? "" : "!text-error"}`}>
                    {(() => {
                      const R = ROTULO[it.nome];
                      const I = R?.icon ?? Search;
                      return (
                        <>
                          <I size={12} /> {R?.texto ?? it.nome}
                          {it.detalhe && <span className="text-muted-foreground">· {it.detalhe}</span>}
                        </>
                      );
                    })()}
                  </span>
                </li>
              ) : (
                <li key={i} className={`flex ${it.tipo === "cliente" ? "justify-end" : "justify-start"}`}>
                  <p
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                      it.tipo === "cliente" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-white text-ink shadow-[var(--shadow-pill)]"
                    }`}
                  >
                    {it.texto}
                  </p>
                </li>
              ),
            )}
            {pendente && conversaId && (
              <li className="flex">
                <span className="rounded-2xl bg-white px-3.5 py-2 text-sm text-muted-foreground shadow-[var(--shadow-pill)]">digitando…</span>
              </li>
            )}
            {fim && <ResumoLigacao fim={fim} />}
          </ol>
          {erro && <p className="px-4 pb-2 text-xs text-error">{erro}</p>}
          <form onSubmit={enviar} className="flex gap-2 border-t border-hairline p-3">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              disabled={!conversaId}
              placeholder={conversaId ? "Fale como um cliente…" : "Comece um teste"}
              className="field !h-10 flex-1"
              aria-label="Mensagem do cliente"
            />
            <button type="submit" disabled={!conversaId || pendente || !texto.trim()} className="grid size-10 place-items-center rounded-full bg-ink text-white disabled:opacity-40" aria-label="Enviar">
              <Send size={15} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}

const RESULTADO: Record<string, string> = {
  resolvido: "Resolvido",
  transferido: "Transferido",
  recado: "Recado",
  nao_resolvido: "Não resolvido",
};

export function ResumoLigacao({ fim }: { fim: ResumoFinal }) {
  return (
    <li className="mt-3 rounded-[12px] bg-white p-3.5 shadow-[var(--shadow-pill)]">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink">Resumo da conversa</p>
        {fim.resultado && <span className="badge !text-xs">{RESULTADO[fim.resultado] ?? fim.resultado}</span>}
      </div>
      {fim.resumo && <p className="mt-2 text-sm text-body">{fim.resumo}</p>}
      {fim.dados && Object.keys(fim.dados).length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {Object.entries(fim.dados).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {fim.avaliacao && (
        <p className={`mt-3 text-xs ${fim.avaliacao.sucesso ? "text-success" : "text-error"}`}>
          {fim.avaliacao.sucesso ? "✓ Sucesso" : "✗ Sem sucesso"} · <span className="text-muted-foreground">{fim.avaliacao.justificativa}</span>
        </p>
      )}
    </li>
  );
}
