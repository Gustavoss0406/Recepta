"use client";

import { useState, useTransition } from "react";
import { Check, KeyRound, Sparkles } from "lucide-react";
import { MOTORES, type IdMotor } from "@/lib/agent/motores";
import { apagarChaveMotor, salvarMotor } from "@/app/painel/agentes/[id]/motor-actions";
import { cn } from "@/lib/utils";

/** Choose the AI that runs the calls: RecepIA (free) or one of 5 providers with the customer's key. */
export function MotorIA({ agenteId, atual, chaves }: { agenteId: string; atual: { provedor: IdMotor; modelo: string }; chaves: Partial<Record<IdMotor, string>> }) {
  const [sel, setSel] = useState<IdMotor>(atual.provedor);
  const [modelo, setModelo] = useState(atual.modelo);
  const [chave, setChave] = useState("");
  const [msg, setMsg] = useState<{ ok?: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const m = MOTORES.find((x) => x.id === sel)!;

  const salvar = () =>
    iniciar(async () => {
      setMsg(null);
      const r = await salvarMotor(agenteId, sel, modelo || m.modelos[0] || "", chave);
      setMsg(r.erro ? { texto: r.erro } : { ok: true, texto: r.mensagem ?? "Salvo." });
      if (!r.erro) setChave("");
    });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-medium">Motor de IA</h2>
        <p className="mt-1 text-sm text-muted-foreground">Quem pensa nas ligações. A RecepIA é grátis e já vem pronta; se preferir, conecte a sua própria conta de outro provedor.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Motor de IA">
        {MOTORES.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={sel === x.id}
            onClick={() => {
              setSel(x.id);
              setModelo(x.id === atual.provedor ? atual.modelo : "");
              setMsg(null);
            }}
            className={cn("relative rounded-[16px] border bg-white p-4 text-left transition-shadow", sel === x.id ? "border-foreground shadow-[var(--shadow-pill)]" : "border-border hover:border-foreground/30")}
          >
            <div className="flex items-center gap-2">
              {x.id === "recepia" ? <Sparkles size={16} className="text-[#2563eb]" /> : <KeyRound size={15} className="text-muted-foreground" />}
              <span className="font-medium">{x.nome}</span>
              {x.gratis && <span className="rounded-full bg-[#2563eb]/10 px-2 py-0.5 text-[11px] text-[#2563eb]">Grátis · padrão</span>}
              {atual.provedor === x.id && <Check size={15} className="ml-auto text-[#22a35a]" aria-label="Em uso" />}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{x.empresa}</p>
            <p className="mt-2 text-sm text-body">{x.descricao}</p>
            {!x.gratis && chaves[x.id] !== undefined && <p className="mt-2 text-xs text-[#22a35a]">Chave salva ••••{chaves[x.id]}</p>}
          </button>
        ))}
      </div>

      {sel !== "recepia" && (
        <div className="space-y-3 rounded-[16px] border border-border bg-white p-4">
          <label className="block text-sm">
            <span className="text-muted-foreground">Modelo</span>
            <input list={`modelos-${sel}`} value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder={m.modelos[0]} className="mt-1 h-10 w-full rounded-[10px] border border-border px-3" />
            <datalist id={`modelos-${sel}`}>
              {m.modelos.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Chave de API {chaves[sel] !== undefined && "(deixe em branco para manter a salva)"}</span>
            <input type="password" autoComplete="off" value={chave} onChange={(e) => setChave(e.target.value)} placeholder={chaves[sel] !== undefined ? `••••${chaves[sel]}` : "Cole a chave aqui"} className="mt-1 h-10 w-full rounded-[10px] border border-border px-3 font-mono" />
          </label>
          <p className="text-xs text-muted-foreground">
            Crie a chave em {m.ondeChave}. Ela fica criptografada e só é usada nas ligações desta empresa. O uso é cobrado pelo provedor direto na sua conta. Se o provedor falhar no meio de uma ligação, a RecepIA assume na hora.
          </p>
          {chaves[sel] !== undefined && (
            <button type="button" disabled={pendente} onClick={() => iniciar(async () => setMsg({ ...(await apagarChaveMotor(agenteId, sel)), texto: "Chave removida." }))} className="text-xs text-muted-foreground underline">
              Remover chave salva
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={salvar} disabled={pendente} className="btn btn-primary btn-sm">
          {pendente ? "Testando…" : sel === "recepia" ? "Usar RecepIA" : "Testar e salvar"}
        </button>
        {msg && <p className={cn("text-sm", msg.ok ? "text-[#22a35a]" : "text-error")}>{msg.texto}</p>}
      </div>
    </div>
  );
}
