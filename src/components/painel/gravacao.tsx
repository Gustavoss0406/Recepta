"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { AudioScrubber } from "@/components/elevenlabs-ui/waveform";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Call recording player in the ElevenAgents history layout: waveform scrubber, play, ±10 s, time, download. */
export function GravacaoLigacao({ conversaId, duracaoS, temAudio, picos }: { conversaId: string; duracaoS: number | null; temAudio: boolean; picos?: number[] | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [tempo, setTempo] = useState(0);
  const [dur, setDur] = useState(duracaoS ?? 0);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const t = () => setTempo(a.currentTime);
    const d = () => Number.isFinite(a.duration) && setDur(a.duration);
    const fim = () => setTocando(false);
    a.addEventListener("timeupdate", t);
    a.addEventListener("loadedmetadata", d);
    a.addEventListener("ended", fim);
    return () => {
      a.removeEventListener("timeupdate", t);
      a.removeEventListener("loadedmetadata", d);
      a.removeEventListener("ended", fim);
    };
  }, []);

  if (!temAudio)
    return (
      <div className="mt-4 flex h-12 items-center gap-3 rounded-[12px] bg-muted px-3 text-xs text-muted-foreground">
        <span className="flex h-5 items-end gap-[2px]" aria-hidden>
          {[3, 6, 4, 8, 5, 3, 7, 4].map((h, i) => (
            <span key={i} className="w-[2px] rounded-full bg-[#d4d4d4]" style={{ height: h * 2 }} />
          ))}
        </span>
        Sem gravação de áudio (conversas por texto, gravação desligada ou expirada pela retenção).
      </div>
    );

  const alternar = () => {
    const a = audio.current!;
    if (a.paused) void a.play().then(() => setTocando(true));
    else {
      a.pause();
      setTocando(false);
    }
  };
  const pular = (d: number) => {
    const a = audio.current!;
    a.currentTime = Math.max(0, Math.min(dur, a.currentTime + d));
  };
  const src = `/api/ligacoes/${conversaId}/audio`;

  return (
    <div className="mt-4">
      <audio ref={audio} src={src} preload="metadata" />
      <AudioScrubber
        data={picos && picos.length ? picos : undefined}
        currentTime={tempo}
        duration={dur || 1}
        onSeek={(t) => {
          if (audio.current) audio.current.currentTime = t;
          setTempo(t);
        }}
        height={48}
        barWidth={2}
        barGap={2}
        barColor="#a3a3a3"
        showHandle={false}
        aria-label="Posição na gravação"
      />
      <div className="mt-3 flex items-center gap-1.5">
        <button type="button" onClick={alternar} className="grid size-9 place-items-center rounded-[10px] bg-foreground text-white transition-transform active:scale-95" aria-label={tocando ? "Pausar" : "Ouvir gravação"}>
          {tocando ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
        </button>
        <button type="button" onClick={() => pular(-10)} className="grid size-9 place-items-center rounded-full text-foreground hover:bg-accent" aria-label="Voltar 10 segundos">
          <RotateCcw size={15} />
        </button>
        <button type="button" onClick={() => pular(10)} className="grid size-9 place-items-center rounded-full text-foreground hover:bg-accent" aria-label="Avançar 10 segundos">
          <RotateCw size={15} />
        </button>
        <span className="ml-auto text-sm text-foreground tabular-nums">
          {mmss(tempo)} <span className="text-muted-foreground">/ {mmss(dur)}</span>
        </span>
        <a href={`${src}?baixar=1`} className="grid size-9 place-items-center rounded-[10px] border border-border text-foreground hover:bg-accent" aria-label="Baixar gravação">
          <Download size={15} />
        </a>
      </div>
    </div>
  );
}
