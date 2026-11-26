"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AtSign, Globe, ArrowUp, ChevronDown, ChevronUp, Mic, RotateCcw, SkipForward, Volume2, VolumeX } from "lucide-react";
import { Orb } from "@/components/ui/orb";
import { Logo } from "@/components/ui/logo";
import { FluxoVivo } from "./fluxo-vivo";
import { ConectarInline } from "./conectar";
import { conexoesDoPerfil } from "@/lib/onboarding/integracoes";
import { onboardingConexoes, onboardingAnalisar, onboardingFinalizar, onboardingMensagem, onboardingPular, onboardingRecomecar } from "@/app/painel/comecar/actions";
import { resumo, type EstadoOnboarding } from "@/lib/onboarding/conversa";
import { gerarFluxo } from "@/lib/onboarding/gerador";
import { pergunta } from "@/lib/onboarding/perguntas";
import { cn } from "@/lib/utils";
import { tirarTags } from "@/lib/voz/tags";

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
export function OnboardingConversa({
  inicial,
  agenteInicial,
  conectadasIniciais = [],
  oauthDisponiveis = [],
}: {
  inicial: EstadoOnboarding;
  agenteInicial?: string | null;
  conectadasIniciais?: string[];
  oauthDisponiveis?: string[];
}) {
  const [conectadas, setConectadas] = useState<string[]>(conectadasIniciais);
  // coming back from a provider's login tab: re-check what's connected
  useEffect(() => {
    const ver = () => void onboardingConexoes().then(setConectadas).catch(() => {});
    window.addEventListener("focus", ver);
    return () => window.removeEventListener("focus", ver);
  }, []);
  const marcarConectada = (id: string) => setConectadas((c) => [...new Set([...c, id])]);
  const [estado, setEstado] = useState(inicial);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [agenteId, setAgenteId] = useState<string | null>(agenteInicial ?? null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [ouvindo, setOuvindo] = useState(false);
  const [falando, setFalando] = useState(false);
  const [voz, setVoz] = useState(true);
  const [canvasAberto, setCanvasAberto] = useState(false);
  const [temMic, setTemMic] = useState(false);
  const rec = useRef<Reconhecedor | null>(null);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  const fluxo = useMemo(() => gerarFluxo(estado.perfil), [estado.perfil]);
  const r = useMemo(() => resumo(estado), [estado]);
  const atual = estado.perguntaAtual ? pergunta(estado.perguntaAtual) : null;
  const pedindoSite = estado.perguntaAtual === "site" && !estado.concluido;
  const chips = atual && !pendente && !pedindoSite ? atual.chips(estado.perfil) : [];
  const [site, setSite] = useState("");
  const [insta, setInsta] = useState("");
  const [analisando, setAnalisando] = useState(false);
  const [etapaAnalise, setEtapaAnalise] = useState(0);
  useEffect(() => {
    if (!analisando) return;
    setEtapaAnalise(0);
    const t = setInterval(() => setEtapaAnalise((x) => Math.min(x + 1, 3)), 3500);
    return () => clearInterval(t);
  }, [analisando]);
  const analisar = (comDados: boolean) => {
    if (ocupado) return;
    const [s1, i1] = comDados ? [site.trim(), insta.trim()] : ["", ""];
    setAnalisando(Boolean(s1 || i1));
    aplicar(
      async () => {
        try {
          return await onboardingAnalisar(s1, i1);
        } finally {
          setAnalisando(false);
        }
      },
      [s1 && `Site: ${s1}`, i1 && `Instagram: ${i1}`].filter(Boolean).join(" · ") || "Não tenho site nem Instagram",
    );
  };
  const ocupado = pendente || Boolean(enviando);

  useEffect(() => {
    const W = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
    setTemMic(Boolean(W.SpeechRecognition ?? W.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [estado.mensagens.length, enviando]);

  // the Recepta speaks with her ElevenLabs voice (best model, audio tags); browser voice only as fallback
  const audio = useRef<HTMLAudioElement | null>(null);
  const analisador = useRef<AnalyserNode | null>(null);
  const ctxAudio = useRef<AudioContext | null>(null);
  const amostras = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const volumeSaida = useCallback(() => {
    const a = analisador.current;
    if (!a || !amostras.current) return 0;
    a.getByteTimeDomainData(amostras.current);
    let soma = 0;
    for (const v of amostras.current) soma += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(soma / amostras.current.length) * 4);
  }, []);
  const calar = () => {
    audio.current?.pause();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setFalando(false);
  };
  const falarNavegador = (t: string) => {
    if (typeof speechSynthesis === "undefined") return;
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "pt-BR";
    u.rate = 1.05;
    const v = speechSynthesis.getVoices().find((x) => x.lang.startsWith("pt-BR"));
    if (v) u.voice = v;
    u.onstart = () => setFalando(true);
    u.onend = () => setFalando(false);
    speechSynthesis.speak(u);
  };
  const falar = async (t: string) => {
    if (!voz) return;
    calar();
    try {
      const r = await fetch("/api/onboarding/voz", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ texto: t }) });
      if (!r.ok) throw new Error(String(r.status));
      const url = URL.createObjectURL(await r.blob());
      const el = audio.current ?? new Audio();
      audio.current = el;
      if (!ctxAudio.current) {
        const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctxAudio.current = new C();
        const fonte = ctxAudio.current.createMediaElementSource(el);
        analisador.current = ctxAudio.current.createAnalyser();
        analisador.current.fftSize = 512;
        amostras.current = new Uint8Array(analisador.current.fftSize);
        fonte.connect(analisador.current);
        analisador.current.connect(ctxAudio.current.destination);
      }
      await ctxAudio.current.resume();
      el.src = url;
      el.onplay = () => setFalando(true);
      el.onended = () => {
        setFalando(false);
        URL.revokeObjectURL(url);
      };
      await el.play();
    } catch {
      falarNavegador(tirarTags(t));
    }
  };
  // the opening line plays on the owner's first interaction (browsers block autoplay before that)
  const abriu = useRef(false);
  useEffect(() => {
    const primeira = () => {
      if (abriu.current) return;
      abriu.current = true;
      if (estado.mensagens.length === 1) void falar(estado.mensagens[0].texto);
    };
    window.addEventListener("pointerdown", primeira, { once: true });
    return () => window.removeEventListener("pointerdown", primeira);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aplicar = (acao: () => Promise<{ estado: EstadoOnboarding; agenteId?: string; erro?: string }>, otimista?: string) => {
    setErro(null);
    setEnviando(otimista ?? null);
    iniciar(async () => {
      try {
        const res = await acao();
        setEstado(res.estado);
        if (res.agenteId) setAgenteId(res.agenteId);
        const ultima = res.estado.mensagens.at(-1);
        if (ultima?.papel === "recepta") void falar(ultima.texto);
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
    calar();
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
            <button type="button" onClick={() => {
                if (voz) calar();
                setVoz((v) => !v);
              }} aria-pressed={voz} title={voz ? "Desligar voz" : "Ouvir a Recepta"} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent">
              {voz ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button type="button" onClick={() => aplicar(onboardingRecomecar)} title="Recomeçar" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent">
              <RotateCcw size={15} />
            </button>
          </div>
        </header>

        <div className="flex items-center gap-3 px-4 pt-2 lg:flex-col lg:gap-2 lg:px-6 lg:pt-4">
          <Orb tamanho={88} estado={estadoOrb} volumeSaida={falando ? volumeSaida : undefined} className="shrink-0 max-lg:!size-12" />
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
                {tirarTags(m.texto)}
              </p>
              {m.conectar?.map((c) => (
                <ConectarInline key={c.id} conexao={c} conectada={conectadas.includes(c.id)} oauth={oauthDisponiveis.includes(c.id)} aoConectar={marcarConectada} compacto={i !== estado.mensagens.length - 1} />
              ))}
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
              {conexoesDoPerfil(estado.perfil).length > 0 && (
                <div className="mt-3 space-y-1" data-testid="checklist-conexoes">
                  <p className="text-xs text-muted-foreground">
                    {conexoesDoPerfil(estado.perfil).filter((c) => c.essencial && !conectadas.includes(c.id)).length
                      ? "Para tudo funcionar como você pediu, falta conectar:"
                      : "Conexões do seu fluxo:"}
                  </p>
                  {conexoesDoPerfil(estado.perfil).map((c) => (
                    <ConectarInline key={c.id} conexao={c} conectada={conectadas.includes(c.id)} oauth={oauthDisponiveis.includes(c.id)} aoConectar={marcarConectada} compacto />
                  ))}
                  <p className="text-[11px] text-muted-foreground">Enquanto não conectar, a recepcionista segue sem essa parte (por exemplo, a equipe confirma o horário em vez do WhatsApp).</p>
                </div>
              )}
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
            {pedindoSite && (
              <div className="mb-2 rounded-[18px] border border-border bg-white p-3" data-testid="campos-empresa">
                {analisando ? (
                  <ol className="space-y-1.5 py-1 text-sm" aria-live="polite">
                    {["Lendo o seu site", "Abrindo o Instagram", "Pesquisando a empresa na internet", "Montando seu fluxo com o que achei"].map((x, i) => (
                      <li key={x} className={cn("flex items-center gap-2 transition-opacity", i > etapaAnalise && "opacity-35")}>
                        <span className={cn("size-1.5 rounded-full", i < etapaAnalise ? "bg-[#22a35a]" : i === etapaAnalise ? "animate-pulse bg-[#2563eb]" : "bg-strong")} />
                        {x}
                        {i === etapaAnalise && "…"}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      analisar(true);
                    }}
                    className="space-y-2"
                  >
                    <label className="flex items-center gap-2 rounded-[12px] border border-border px-3 focus-within:border-foreground/30">
                      <Globe size={15} className="shrink-0 text-muted-foreground" />
                      <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="suaempresa.com.br" aria-label="Site" inputMode="url" autoCapitalize="none" className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none lg:text-sm" />
                    </label>
                    <label className="flex items-center gap-2 rounded-[12px] border border-border px-3 focus-within:border-foreground/30">
                      <AtSign size={15} className="shrink-0 text-muted-foreground" />
                      <input value={insta} onChange={(e) => setInsta(e.target.value)} placeholder="instagram da empresa" aria-label="Instagram" autoCapitalize="none" className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none lg:text-sm" />
                    </label>
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <button type="button" onClick={() => analisar(false)} disabled={ocupado} className="text-xs text-muted-foreground hover:text-foreground">
                        Não tenho nenhum dos dois
                      </button>
                      <button type="submit" disabled={ocupado || (!site.trim() && !insta.trim())} className="btn btn-primary btn-sm">
                        Analisar minha empresa
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
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
