"use client";

import { X } from "lucide-react";
import { VoiceTest } from "@/components/painel/voice-test";
import type { OrbTom } from "@/components/ui/orb";

const SISTEMA = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function hostDoSite(): string | null {
  try {
    const anc = (location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
    if (anc && anc.length) return new URL(anc[anc.length - 1]).hostname;
    if (document.referrer) return new URL(document.referrer).hostname;
  } catch {}
  return null;
}

export function WidgetCliente({ agenteId, empresa, nome }: { agenteId: string; empresa: string; nome: string; tom: OrbTom }) {
  const obterToken = async () => {
    const r = await fetch(`/api/widget/${agenteId}/sessao`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ host: hostDoSite() }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro ?? "Atendimento indisponível.");
    return { token: j.token as string, url: j.url as string };
  };
  return (
    <div className="flex h-dvh flex-col bg-white text-[#0a0a0a] [&_*]:![font-family:inherit]" style={{ fontFamily: SISTEMA }}>
      <header className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{empresa}</p>
          <p className="truncate text-xs text-[#737373]">{nome}, recepcionista virtual · conversa gravada</p>
        </div>
        <button
          type="button"
          onClick={() => window.parent?.postMessage({ recepta: "fechar" }, "*")}
          className="grid size-8 place-items-center rounded-full text-[#525252] hover:bg-black/[0.05]"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>
      </header>
      <VoiceTest agenteId={agenteId} obterToken={obterToken} variante="widget" nomeAgente={nome} />
      <p className="border-t border-black/[0.06] px-4 py-2 text-center text-[0.6875rem] text-[#a3a3a3]">Atendimento por Recepta</p>
    </div>
  );
}
