"use client";

import { useState } from "react";
import { HeartHandshake, Laugh, Megaphone, Moon, PhoneCall, Siren, Sparkles } from "lucide-react";
import { Orb } from "@/components/ui/orb";
import { VOICES } from "@/lib/voices";
import { cn } from "@/lib/utils";

const COMECE = [
  { rotulo: "Acolher uma reclamação", icone: HeartHandshake, texto: "[sighs] Poxa, sinto muito por isso… [reassuring] Fica tranquilo, eu já passei pra equipe e hoje mesmo alguém te liga." },
  { rotulo: "Dar uma boa notícia", icone: Sparkles, texto: "[excited] Consegui! Tem um horário amanhã às dez, bem do jeitinho que você pediu." },
  { rotulo: "Rir junto", icone: Laugh, texto: "[laughs softly] Ah, essa foi boa! Mas deixa eu ver aqui o seu horário…" },
  { rotulo: "Fora do horário", icone: Moon, texto: "[warmly] Oi! A gente já fechou por hoje, mas eu consigo marcar pra você agora mesmo. [short pause] Que dia fica melhor?" },
  { rotulo: "Confirmar o horário", icone: PhoneCall, texto: "Fechado: quinta-feira, às nove e meia, com a doutora Ana. [happy] Te mando a confirmação no WhatsApp!" },
  { rotulo: "Urgência", icone: Siren, texto: "[breathes] Entendi, é urgente. [reassuring] Vou te passar agora pro plantão, só um instante." },
  { rotulo: "Saudação", icone: Megaphone, texto: "Clínica Sorriso, boa tarde! Aqui é a Lia, recepcionista virtual. A ligação é gravada. Como posso ajudar?" },
];

/** ElevenLabs-style text-to-speech playground for the receptionist's voice. */
export function PlaygroundVoz({ vozInicial }: { vozInicial: string }) {
  const [voz, setVoz] = useState(vozInicial);
  const [texto, setTexto] = useState("");
  const [estabilidade, setEstabilidade] = useState(0.38);
  const [estilo, setEstilo] = useState(0.35);
  const [audio, setAudio] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const v = VOICES.find((x) => x.id === voz) ?? VOICES[0];

  const gerar = async () => {
    setGerando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/vozes/${voz}/falar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ texto, estabilidade, estilo }) });
      if (!r.ok) throw new Error(await r.text());
      const url = URL.createObjectURL(await r.blob());
      setAudio(url);
      void new Audio(url).play();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui gerar a fala.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-[20px] border border-border bg-white" data-testid="playground-voz">
      <div className="grid lg:grid-cols-[1fr_300px]">
        <div className="flex min-h-[360px] flex-col p-5">
          <span className="inline-flex w-fit items-center gap-2 rounded-[10px] border border-border px-2.5 py-1 text-sm">
            <Orb tom={v.tone} tamanho={18} />
            {v.name} · {v.style}
          </span>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva o que a recepcionista vai falar. Use emoções como [sighs], [laughs softly], [excited]…"
            aria-label="Texto para falar"
            className="mt-4 min-h-36 flex-1 resize-none bg-transparent text-[1.0625rem] leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">Comece com</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {COMECE.map((c) => (
                <button key={c.rotulo} type="button" onClick={() => setTexto(c.texto)} className="flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-1.5 text-sm hover:bg-accent">
                  <c.icone size={14} /> {c.rotulo}
                </button>
              ))}
            </div>
          </div>
        </div>
        <aside className="space-y-5 border-t border-border p-5 lg:border-t-0 lg:border-l">
          <label className="block">
            <span className="text-sm font-medium">Voz</span>
            <select value={voz} onChange={(e) => setVoz(e.target.value)} className="mt-2 h-10 w-full rounded-[12px] border border-border bg-white px-3 text-sm">
              {VOICES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {x.style}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-[12px] border border-transparent bg-[linear-gradient(white,white)_padding-box,linear-gradient(90deg,#e5e5e5,#f97316,#e5e5e5)_border-box] px-3 py-2.5 text-sm">
            <span className="mr-2 rounded-[6px] border border-foreground px-1 text-[11px] font-semibold">v4</span>Eleven v4 · com emoções
          </div>
          {[
            ["Estabilidade", "Criativa", "Estável", estabilidade, setEstabilidade],
            ["Estilo", "Neutro", "Expressivo", estilo, setEstilo],
          ].map(([nome, a, b, valor, set]) => (
            <label key={nome as string} className="block">
              <span className="text-sm font-medium">{nome as string}</span>
              <span className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{a as string}</span>
                <span>{b as string}</span>
              </span>
              <input type="range" min={0} max={1} step={0.05} value={valor as number} onChange={(e) => (set as (n: number) => void)(Number(e.target.value))} className="mt-1 w-full accent-black" />
            </label>
          ))}
          <button type="button" onClick={gerar} disabled={gerando || !texto.trim()} className={cn("btn btn-primary w-full", gerando && "animate-pulse")}>
            {gerando ? "Gerando…" : "Gerar fala"}
          </button>
          {audio && <audio src={audio} controls className="w-full" />}
          {erro && <p className="text-xs text-error">{erro}</p>}
        </aside>
      </div>
    </section>
  );
}
