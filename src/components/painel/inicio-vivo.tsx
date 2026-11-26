"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUp, Mic, Plus, X } from "lucide-react";
import { Orb } from "@/components/ui/orb";
import { cn } from "@/lib/utils";

/** Thin dismissible announcement strip with small floating photos (ElevenLabs-style). */
export function FaixaAnuncio({ id, texto, destaque, href, acao, fotos }: { id: string; texto: string; destaque: string; href: string; acao: string; fotos: string[] }) {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    try {
      setVisivel(localStorage.getItem(`faixa:${id}`) !== "fechada");
    } catch {
      setVisivel(true);
    }
  }, [id]);
  if (!visivel) return null;
  const posicoes = ["left-[4%] top-1", "left-[14%] top-3", "left-[24%] -top-1", "right-[22%] top-2", "right-[12%] -top-1", "right-[4%] top-3"];
  return (
    <div className="relative flex h-11 items-center justify-center overflow-hidden bg-[#0a0a0a] px-12 text-[0.8125rem] text-white">
      {fotos.slice(0, 6).map((f, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={f + i} src={f} alt="" className={cn("faixa-flutua pointer-events-none absolute hidden h-6 w-8 rounded-[5px] object-cover opacity-80 md:block", posicoes[i])} style={{ animationDelay: `${i * 0.7}s` }} />
      ))}
      <span className="relative z-10 flex items-center gap-2.5 truncate">
        <span className="text-white/55">{texto}</span>
        <span className="hidden text-white/30 sm:inline">|</span>
        <span className="hidden font-medium sm:inline">{destaque}</span>
        <Link href={href} className="ml-1 shrink-0 rounded-full bg-white px-3 py-1 text-[0.75rem] font-medium text-black hover:bg-white/85">
          {acao}
        </Link>
      </span>
      <button
        type="button"
        aria-label="Fechar"
        onClick={() => {
          setVisivel(false);
          try {
            localStorage.setItem(`faixa:${id}`, "fechada");
          } catch {}
        }}
        className="absolute right-3 z-10 grid size-7 place-items-center rounded-full text-white/70 hover:text-white"
      >
        <X size={15} />
      </button>
    </div>
  );
}

/** "Como a Recepta pode ajudar, Gustavo?" — asks the configuration assistant in plain words. */
export function PromptRecepta({ nome, agenteId }: { nome: string; agenteId: string | null }) {
  const [texto, setTexto] = useState("");
  const [ouvindo, setOuvindo] = useState(false);
  const router = useRouter();
  const sugestoes = ["Quando pedirem desconto, passe pra mim", "Atenda também aos sábados até meio-dia", "Seja mais descontraída", "Explique o estacionamento"];
  const enviar = (t = texto) => {
    const v = t.trim();
    if (!v) return;
    router.push(agenteId ? `/painel/agentes/${agenteId}?aba=agente&pedido=${encodeURIComponent(v)}` : `/painel/comecar?conversa=1&negocio=${encodeURIComponent(v)}`);
  };
  const microfone = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!C) return;
    const r = new C();
    r.lang = "pt-BR";
    r.onresult = (e) => setTexto(Array.from(e.results).map((x) => x[0].transcript).join(" "));
    r.onend = () => setOuvindo(false);
    setOuvindo(true);
    r.start();
  };
  return (
    <div className="mx-auto w-full max-w-[640px] text-center">
      <h2 className="text-[1.375rem] font-medium tracking-[-0.02em] sm:text-[1.625rem]">Como a Recepta pode ajudar, {nome}?</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
        className="mt-5 flex items-center gap-2 rounded-full border border-border bg-white p-1.5 pl-2 shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.04)] focus-within:border-foreground/25"
      >
        <Orb tamanho={30} tom="peach" />
        <Plus size={18} className="hidden shrink-0 text-muted-foreground sm:block" />
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={agenteId ? "Peça uma mudança na sua recepcionista…" : "Conte qual é o seu negócio…"} aria-label="Pedido para a Recepta" className="h-9 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-[0.9375rem]" />
        <span className="hidden rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">Assistente</span>
        <button type="button" onClick={microfone} aria-label="Falar" className={cn("grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent", ouvindo && "animate-pulse text-[#e5484d]")}>
          <Mic size={16} />
        </button>
        <button type="submit" disabled={!texto.trim()} aria-label="Enviar" className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-white disabled:bg-[#a3a3a3]">
          <ArrowUp size={16} />
        </button>
      </form>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {sugestoes.map((s) => (
          <button key={s} type="button" onClick={() => enviar(s)} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
type SpeechRec = { lang: string; start(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null };

/** Black rounded banner with inline photo chips; slides rotate every few seconds (dots to pick). */
export function BannerRotativo({ slides }: { slides: { linha1: string; linha2: string; fotos: string[]; href: string }[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length]);
  const s = slides[i];
  const chip = (f: string | undefined, k: number) =>
    f ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img key={k} src={f} alt="" className="mx-1 inline-block h-[0.95em] w-[1.35em] rounded-[5px] object-cover align-[-0.08em]" />
    ) : null;
  return (
    <div>
      <Link href={s.href} className="relative block overflow-hidden rounded-[24px] bg-[#0a0a0a] px-6 py-10 text-center sm:py-14" aria-live="polite">
        <div key={i} className="banner-entra">
          <p className="text-[1.5rem] leading-tight font-medium tracking-[-0.03em] text-white/45 sm:text-[2.25rem]">
            {chip(s.fotos[0], 0)}
            {s.linha1}
            {chip(s.fotos[1], 1)}
          </p>
          <p className="mt-1 text-[1.5rem] leading-tight font-medium tracking-[-0.03em] text-white sm:text-[2.25rem]">
            {chip(s.fotos[2], 2)}
            {s.linha2}
            {chip(s.fotos[3], 3)}
          </p>
        </div>
      </Link>
      <div className="mt-3 flex justify-center gap-1.5">
        {slides.map((_, k) => (
          <button key={k} type="button" aria-label={`Destaque ${k + 1}`} onClick={() => setI(k)} className={cn("size-1.5 rounded-full transition-colors", k === i ? "bg-foreground" : "bg-[#d4d4d4]")} />
        ))}
      </div>
    </div>
  );
}
