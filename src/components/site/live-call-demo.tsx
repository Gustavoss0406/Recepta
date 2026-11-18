"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, MessageCircle, PhoneIncoming } from "lucide-react";
import { formatDuration } from "@/lib/format";

type Line =
  | { who: "agente" | "cliente"; text: string }
  | { who: "acao"; text: string; icon: "agenda" | "whats" };

const SCRIPT: Line[] = [
  { who: "agente", text: "Clínica Sorriso, boa tarde! Aqui é a Lia, recepcionista virtual. A ligação é gravada. Como posso te ajudar?" },
  { who: "cliente", text: "Oi, queria marcar uma limpeza para a semana que vem." },
  { who: "agente", text: "Claro! Tenho quinta, dia 24, às 9h ou às 14h30. Qual fica melhor pra você?" },
  { who: "cliente", text: "Às 14h30, por favor." },
  { who: "acao", text: "Consulta criada no Google Agenda", icon: "agenda" },
  { who: "agente", text: "Prontinho, está agendado. Vou mandar a confirmação no seu WhatsApp, tudo bem?" },
  { who: "acao", text: "Confirmação enviada por WhatsApp", icon: "whats" },
];

const STEP_MS = 1900;

export function LiveCallDemo({ tone = "light" }: { tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  const [shown, setShown] = useState(1);
  const [seconds, setSeconds] = useState(4);

  useEffect(() => {
    const step = setInterval(() => setShown((n) => (n >= SCRIPT.length + 2 ? 1 : n + 1)), STEP_MS);
    const clock = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      clearInterval(step);
      clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    if (shown === 1) setSeconds(4);
  }, [shown]);

  const visible = SCRIPT.slice(0, Math.min(shown, SCRIPT.length));
  const speaking = visible.at(-1)?.who === "agente";

  return (
    <div className={`relative overflow-hidden ${dark ? "text-white" : "card shadow-soft"}`} role="img" aria-label="Demonstração: recepcionista virtual atendendo uma ligação e agendando uma consulta">
      <div className={`flex items-center justify-between px-5 py-4 ${dark ? "border-b border-white/10" : "border-b border-hairline"}`}>
        <div className="flex items-center gap-3">
          <span className={`relative grid size-9 place-items-center rounded-full ${dark ? "bg-white text-ink" : "bg-ink text-white"}`}>
            <PhoneIncoming size={16} />
            <span className={`absolute inset-0 rounded-full border ${dark ? "border-white" : "border-ink"} [animation:pulse-ring_1.8s_ease-out_infinite]`} />
          </span>
          <div className="leading-tight">
            <p className={`text-sm font-medium ${dark ? "text-white" : "text-ink"}`}>Clínica Sorriso</p>
            <p className={`text-xs ${dark ? "text-white/60" : "text-muted-foreground"}`}>Chamada em andamento · {formatDuration(seconds)}</p>
          </div>
        </div>
        <Waveform active={speaking} className={dark ? "[&>span]:bg-white" : ""} />
      </div>

      <ol className="flex h-[22rem] flex-col justify-end gap-3 overflow-hidden px-5 py-5 sm:h-[20rem]" aria-hidden="true">
        {visible.map((l, i) =>
          l.who === "acao" ? (
            <li key={i} className="flex animate-[fade-up_400ms_ease-out] justify-center">
              <span className="badge">
                {l.icon === "agenda" ? <CalendarCheck size={13} /> : <MessageCircle size={13} />}
                <span className="text-[0.75rem] font-medium">{l.text}</span>
              </span>
            </li>
          ) : (
            <li
              key={i}
              className={`flex animate-[fade-up_400ms_ease-out] ${l.who === "cliente" ? "justify-end" : "justify-start"}`}
            >
              <p
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-snug ${
                  l.who === "cliente"
                    ? dark
                      ? "rounded-br-md border border-white/40 text-white"
                      : "rounded-br-md bg-ink text-white"
                    : dark
                      ? "rounded-bl-md bg-white text-ink"
                      : "rounded-bl-md bg-strong text-ink"
                }`}
              >
                {l.text}
              </p>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}

export function Waveform({ active = true, bars = 18, className = "" }: { active?: boolean; bars?: number; className?: string }) {
  return (
    <span className={`flex h-6 items-center gap-[3px] ${className}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="w-[3px] origin-center rounded-full bg-ink"
          style={{
            height: `${30 + ((i * 37) % 70)}%`,
            opacity: active ? 0.85 : 0.25,
            animation: active ? `wave ${700 + ((i * 53) % 500)}ms ease-in-out ${(i * 41) % 300}ms infinite` : "none",
            transform: active ? undefined : "scaleY(0.35)",
          }}
        />
      ))}
    </span>
  );
}
