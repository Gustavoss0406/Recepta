"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowUp, ChevronDown, ChevronUp, Mic, RotateCcw, SkipForward, Volume2, VolumeX } from "lucide-react";
import { Orb } from "@/components/ui/orb";
import { Logo } from "@/components/ui/logo";
import { FluxoVivo } from "./fluxo-vivo";
import { onboardingFinalizar, onboardingMensagem, onboardingPular, onboardingRecomecar } from "@/app/painel/comecar/actions";
import { resumo, type EstadoOnboarding } from "@/lib/onboarding/conversa";
import { gerarFluxo } from "@/lib/onboarding/gerador";
import { pergunta } from "@/lib/onboarding/perguntas";
import { cn } from "@/lib/utils";

type Reconhecedor = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

const CAMADAS = [
  ["base", "Seu negócio"],
  ["dinamica", "Do seu jeito"],
  ["avancada", "Detalhes finos"],
] as const;

/**
 * First access: a conversation with the Recepta (orb + chat + mic) while the business's own
 * service flow assembles itself on the canvas. Desktop: chat left, canvas right. Phone: canvas
 * strip on top (expandable), chat below.
 */
export function OnboardingConversa({ inicial, agenteInicial }: { inicial: EstadoOnboarding; agenteInicial?: string | null }) {
  const [estado, setEstado] = useState(inicial);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [agenteId, setAgenteId] = useState<string | null>(agenteInicial ?? null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [ouvindo, setOuvindo] = useState(false);
  const [falando, setFalando] = useState(false);
  const [voz, setVoz] = useState(false);
  const [canvasAberto, setCanvasAberto] = useState(false);
  const [temMic, setTemMic] = useState(false);
  const rec = useRef<Reconhecedor | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  const fluxo = useMemo(() => gerarFluxo(estado.perfil), [estado.perfil]);
  const r = useMemo(() => resumo(estado), [estado]);
  const atual = estado.perguntaAtual ? pergunta(estado.perguntaAtual) : null;
  const chips = atual && !pendente ? atual.chips(estado.perfil) : [];
  const ocupado = pendente || Boolean(enviando);

  useEffect(() => {
    const W = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
    setTemMic(Boolean(W.SpeechRecognition ?? W.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [estado.mensagens.length, enviando]);

  // read the Recepta's replies aloud when the owner turned voice on
  const falar = (t: string) => {
    if (!voz || typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t.replace(/[👋✨]/gu, ""));
    u.lang = "pt-BR";
    u.rate = 1.05;
    const v = speechSynthesis.getVoices().find((x) => x.lang.startsWith("pt-BR"));
    if (v) u.voice = v;
    u.onstart = () => setFalando(true);
    u.onend = () => setFalando(false);
    speechSynthesis.speak(u);
  };

  const aplicar = (acao: () => Promise<{ estado: EstadoOnboarding; agenteId?: string; erro?: string }>, otimista?: string) => {
    setErro(null);
    setEnviando(otimista ?? null);
    iniciar(async () => {
      try {
        const res = await acao();
        setEstado(res.estado);
        if (res.agenteId) setAgenteId(res.agenteId);
        const ultima = res.estado.mensagens.at(-1);
        if (ultima?.papel === "recepta") falar(ultima.texto);
      } catch {
        setErro("Não consegui falar com o servidor. Tenta de novo?");
      } finally {
        setEnviando(null);
        campo.current?.focus();
      }
    });
  };

  const enviar = (t = texto) => {
    const v = t.trim();
    if (!v || ocupado) return;
    setTexto("");
    aplicar(() => onboardingMensagem(v), v);
  };

  const microfone = () => {
    if (ouvindo) return rec.current?.stop();
    const W = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
    const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!C) return;
    const x = new C();
    x.lang = "pt-BR";
    x.interimResults = true;
    x.continuous = false;
    let final = "";
    x.onresult = (e) => {
      const partes = Array.from(e.results);
      final = partes.map((p) => p[0].transcript).join(" ");
      setTexto(final);
    };
    x.onend = () => {
      setOuvindo(false);
      if (final.trim()) enviar(final);
    };
    x.onerror = () => setOuvindo(false);
    rec.current = x;
    setOuvindo(true);
    speechSynthesis?.cancel();
    x.start();
  };

  const estadoOrb = ouvindo ? "listening" : ocupado ? "thinking" : falando ? "talking" : null;
  const camadaAtual = estado.concluido ? 3 : CAMADAS.findIndex(([c]) => c === r.camada);

  return (
    <div className="fixed inset-0 z-50 grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] bg-background lg:grid-cols-[minmax(380px,460px)_1fr] lg:grid-rows-1" data-testid="onboarding-conversa" data-pergunta={estado.perguntaAtual ?? ""}>
      {/* canvas: top strip on phones, right side on desktop */}
      <section className={cn("relative order-1 border-b border-border transition-[height] duration-500 lg:order-2 lg:h-auto lg:border-b-0 lg:border-l", canvasAberto ? "h-[72dvh]" : "h-[36dvh]")}>
        <FluxoVivo fluxo={fluxo} className="absolute inset-0" />
        <button
          type="button"
          onClick={() => setCanvasAberto((v) => !v)}
          className="absolute right-14 bottom-3 flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-xs shadow-[0_1px_3px_rgba(0,0,0,.1)] backdrop-blur lg:hidden"
        >
          {canvasAberto ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {canvasAberto ? "Voltar à conversa" : "Ver fluxo"}
        </button>
      </section>

      {/* conversation */}
      <section className="order-2 flex min-h-0 flex-col lg:order-1">
        <header className="flex items-center justify-between gap-3 px-4 pt-3 lg:px-6 lg:pt-5">
          <Logo className="h-5 w-auto" />
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setVoz((v) => !v)} aria-pressed={voz} title={voz ? "Desligar voz" : "Ouvir a Recepta"} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent">
              {voz ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button type="button" onClick={() => aplicar(onboardingRecomecar)} title="Recomeçar" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent">
              <RotateCcw size={15} />
            </button>
          </div>
        </header>

        <div className="flex items-center gap-3 px-4 pt-2 lg:flex-col lg:gap-2 lg:px-6 lg:pt-4">
          <Orb tamanho={88} estado={estadoOrb} className="shrink-0 max-lg:!size-12" />
          <div className="min-w-0 flex-1 lg:w-full lg:text-center">
            <p className="text-sm font-medium">Recepta</p>
            <ol className="mt-1.5 flex gap-1.5 lg:justify-center" aria-label="Progresso">
              {CAMADAS.map(([c, rot], i) => (
                <li key={c} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className={cn("h-1.5 w-8 rounded-full lg:w-12", i < camadaAtual ? "bg-[#2563eb]" : i === camadaAtual ? "bg-[#2563eb]/40" : "bg-strong")} />
                  <span className={cn("hidden sm:inline", i === camadaAtual && "text-foreground")}>{rot}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div ref={lista} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 lg:px-6" aria-live="polite" data-testid="mensagens">
          {estado.mensagens.map((m, i) => (
            <div key={i} className={cn("onb-msg flex flex-col", m.papel === "dono" ? "items-end" : "items-start")}>
              <p
                className={cn(
                  "max-w-[88%] rounded-[18px] px-3.5 py-2 text-[0.9375rem] leading-snug whitespace-pre-wrap",
                  m.papel === "dono" ? "rounded-br-[6px] bg-foreground text-white" : "rounded-bl-[6px] bg-muted text-foreground",
                )}
              >
                {m.texto}
              </p>
              {m.mudancas && m.mudancas.nos > 0 && (
                <span className="mt-1 ml-1 text-[11px] text-[#2563eb]">
                  +{m.mudancas.nos} etapas · +{m.mudancas.arestas} conexões
                </span>
              )}
            </div>
          ))}
          {enviando && (
            <div className="onb-msg flex justify-end">
              <p className="max-w-[88%] rounded-[18px] rounded-br-[6px] bg-foreground px-3.5 py-2 text-[0.9375rem] text-white opacity-70">{enviando}</p>
            </div>
          )}
          {ocupado && (
            <div className="flex gap-1 px-2 py-1" aria-label="Recepta está pensando">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          )}
          {estado.concluido && (
            <div className="onb-msg rounded-[18px] border border-border bg-white p-4 shadow-[var(--shadow-pill)]" data-testid="onboarding-pronto">
              <p className="text-sm text-muted-foreground">Seu fluxo está pronto</p>
              <p className="mt-1 text-2xl font-medium tracking-[-0.02em]">
                {fluxo.workflow.nos.length} etapas · {fluxo.workflow.arestas.length} conexões
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {agenteId ? (
                  <>
                    <Link href="/painel/comecar?passo=5" className="btn btn-primary btn-sm">
                      Testar minha recepcionista
                    </Link>
                    <Link href={`/painel/agentes/${agenteId}?aba=workflow`} className="btn btn-secondary btn-sm">
                      Abrir no editor
                    </Link>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">Criando sua recepcionista…</span>
                )}
              </div>
            </div>
          )}
        </div>

        {!estado.concluido && (
          <div className="border-t border-border px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-5">
            {chips.length > 0 && (
              <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
                {chips.map((c) => (
                  <button key={c} type="button" onClick={() => enviar(c)} className="shrink-0 rounded-full border border-border bg-white px-3 py-1.5 text-[13px] whitespace-nowrap hover:bg-accent">
                    {c}
                  </button>
                ))}
              </div>
            )}
            {erro && <p className="mb-1.5 text-xs text-error">{erro}</p>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                enviar();
              }}
              className="flex items-end gap-2 rounded-[22px] border border-border bg-white p-1.5 pl-3.5 focus-within:border-foreground/30"
            >
              <textarea
                ref={campo}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                  }
                }}
                rows={1}
                placeholder={ouvindo ? "Ouvindo…" : "Responda do seu jeito…"}
                aria-label="Sua resposta"
                className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground lg:text-[0.9375rem]"
                autoFocus
              />
              {temMic && (
                <button type="button" onClick={microfone} aria-label={ouvindo ? "Parar" : "Falar"} className={cn("grid size-9 shrink-0 place-items-center rounded-full", ouvindo ? "animate-pulse bg-[#e5484d] text-white" : "text-muted-foreground hover:bg-accent")}>
                  <Mic size={17} />
                </button>
              )}
              <button type="submit" disabled={!texto.trim() || ocupado} aria-label="Enviar" className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-white disabled:opacity-30">
                <ArrowUp size={17} />
              </button>
            </form>
            <div className="mt-1.5 flex items-center justify-between px-1 text-xs text-muted-foreground">
              <button type="button" disabled={ocupado} onClick={() => aplicar(onboardingPular, "Pular")} className="flex items-center gap-1 hover:text-foreground">
                <SkipForward size={12} /> Pular
              </button>
              <span className="tabular-nums">
                {r.feitas}/{r.total}
              </span>
              {r.baseOk ? (
                <button type="button" disabled={ocupado} onClick={() => aplicar(onboardingFinalizar, "Pode finalizar")} className="hover:text-foreground">
                  Já está bom, finalizar
                </button>
              ) : (
                <Link href="/painel/comecar?modo=formulario" className="hover:text-foreground">
                  Prefiro formulário
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
