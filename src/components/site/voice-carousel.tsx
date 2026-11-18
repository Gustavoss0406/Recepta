"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { VOICES } from "@/lib/voices";
import { Orb } from "@/components/ui/orb";

const CHANNELS = ["Telefone", "WhatsApp", "Site"] as const;
const NICHES = ["Clínicas", "Imobiliárias", "Restaurantes", "Oficinas", "Escritórios", "E-commerce"];

type PlayState = "idle" | "loading" | "audio" | "text";

/**
 * Hero product panel: channel tabs, a carousel of voice orbs with preview,
 * and niche pills. Preview plays real audio when the TTS engine is configured;
 * otherwise it reveals the sample word by word so the demo still reads.
 */
export function VoiceCarousel() {
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("Telefone");
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<PlayState>("idle");
  const [words, setWords] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const voice = VOICES[index];
  const sampleWords = voice.sample.split(" ");

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setState("idle");
    setWords(0);
  }

  function revealWords(msPerWord: number) {
    setWords(0);
    timer.current = setInterval(() => {
      setWords((w) => {
        if (w >= sampleWords.length) {
          if (timer.current) clearInterval(timer.current);
          return w;
        }
        return w + 1;
      });
    }, msPerWord);
  }

  async function play() {
    if (state !== "idle") return stop();
    setState("loading");
    try {
      const res = await fetch(`/api/vozes/${voice.id}/previa`);
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = stop;
      await audio.play();
      setState("audio");
      revealWords(Math.max(180, ((audio.duration || 4) * 1000) / sampleWords.length));
    } catch {
      setState("text");
      revealWords(260);
    }
  }

  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps

  function go(delta: number) {
    stop();
    setIndex((i) => (i + delta + VOICES.length) % VOICES.length);
  }

  const neighbors = [-2, -1, 1, 2].map((d) => ({ d, v: VOICES[(index + d + VOICES.length) % VOICES.length] }));

  return (
    <div className="panel overflow-hidden p-1.5">
      <div role="tablist" aria-label="Canal" className="grid grid-cols-3 gap-1">
        {CHANNELS.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={channel === c}
            onClick={() => setChannel(c)}
            className={`h-10 rounded-[10px] text-sm transition-colors ${
              channel === c ? "bg-white text-ink shadow-[var(--shadow-pill)]" : "text-muted-foreground hover:text-ink"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="relative flex flex-col items-center px-4 pt-10 pb-6 sm:pt-12">
        <div className="relative flex h-[200px] w-full items-center justify-center sm:h-[240px]">
          {neighbors.map(({ d, v }) => (
            <button
              key={`${v.id}-${d}`}
              type="button"
              onClick={() => go(d)}
              aria-label={`Ouvir ${v.name}`}
              className="absolute hidden transition-transform duration-500 sm:block"
              style={{
                transform: `translateX(${d * 190 + (d > 0 ? 40 : -40)}px) scale(${Math.abs(d) === 1 ? 0.62 : 0.45})`,
                opacity: Math.abs(d) === 1 ? 0.95 : 0.45,
              }}
            >
              <Orb tom={v.tone} tamanho={200} estatico />
            </button>
          ))}
          <Orb tom={voice.tone} tamanho={200} className="relative z-10 max-sm:!size-[168px]">
            <button
              type="button"
              onClick={play}
              aria-label={state === "idle" ? `Ouvir prévia da voz ${voice.name}` : "Parar prévia"}
              className="grid size-12 place-items-center rounded-full bg-white text-ink shadow-lg transition-transform hover:scale-105"
            >
              {state === "idle" || state === "loading" ? (
                <Play size={18} fill="currentColor" className={state === "loading" ? "animate-pulse" : ""} />
              ) : (
                <Pause size={18} fill="currentColor" />
              )}
            </button>
          </Orb>
        </div>

        <div className="mt-6 flex w-full max-w-md items-center justify-between gap-4">
          <button type="button" onClick={() => go(-1)} aria-label="Voz anterior" className="grid size-9 place-items-center rounded-full text-ink hover:bg-white">
            <ChevronLeft size={18} />
          </button>
          <div className="min-h-[5.5rem] text-center" aria-live="polite">
            <p className="text-[0.9375rem] font-medium text-ink">
              {voice.name} <span className="font-normal text-muted-foreground">· {voice.accent}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{voice.style}</p>
            {state !== "idle" && (
              <p className="mt-3 text-sm leading-snug text-ink">
                {sampleWords.map((w, i) => (
                  <span key={i} className={i < words ? "opacity-100" : "opacity-20"} style={{ transition: "opacity 200ms" }}>
                    {w}{" "}
                  </span>
                ))}
              </p>
            )}
            {state === "text" && words >= sampleWords.length && (
              <p className="mt-2 text-xs text-muted-foreground">Áudio da prévia disponível quando o motor de voz estiver configurado.</p>
            )}
          </div>
          <button type="button" onClick={() => go(1)} aria-label="Próxima voz" className="grid size-9 place-items-center rounded-full text-ink hover:bg-white">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5 px-3 pb-3">
        {NICHES.map((n, i) => (
          <span
            key={n}
            className={`inline-flex h-9 items-center rounded-full px-3.5 text-sm ${
              i === 0 ? "bg-white text-ink shadow-[var(--shadow-pill)]" : "text-body"
            }`}
          >
            {n}
          </span>
        ))}
        <Link href="/criar-conta" className="btn btn-sm btn-primary ml-1">
          Criar minha recepcionista
        </Link>
      </div>
    </div>
  );
}
