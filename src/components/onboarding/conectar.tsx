"use client";

import { useActionState, useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { CONECTORES } from "@/lib/integracoes/catalogo";
import type { ConexaoNecessaria } from "@/lib/onboarding/integracoes";
import { acaoConectarIntegracao } from "@/app/painel/integracoes/actions";
import { cn } from "@/lib/utils";

/**
 * Connect an integration right inside the onboarding conversation: token connectors show their
 * fields here; OAuth ones open the provider in a new tab (the conversation re-checks on return).
 */
export function ConectarInline({ conexao, conectada, oauth, aoConectar, compacto }: { conexao: ConexaoNecessaria; conectada: boolean; oauth: boolean; aoConectar: (id: string) => void; compacto?: boolean }) {
  const c = CONECTORES.find((x) => x.id === conexao.id);
  const [aberto, setAberto] = useState(!compacto);
  const [estado, acao, pendente] = useActionState(async (prev: { ok?: boolean; erro?: string; mensagem?: string } | undefined, fd: FormData) => {
    const r = await acaoConectarIntegracao(conexao.id, prev, fd);
    if (r?.ok) aoConectar(conexao.id);
    return r;
  }, undefined);
  if (!c) return null;
  const hrefOAuth = c.id === "google" ? "/api/integracoes/google?permissoes=agenda" : `/api/integracoes/${c.id}/oauth`;
  const usaOAuth = c.auth === "oauth" || (oauth && !c.campos?.length);

  return (
    <div className={cn("mt-2 w-full max-w-[88%] rounded-[16px] border bg-white p-3", conectada ? "border-[#22a35a]/40" : "border-border")} data-testid={`conectar-${c.id}`}>
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={c.logo} alt="" width={28} height={28} className="size-7 shrink-0 rounded-[8px] object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {c.nome}
            {!conexao.essencial && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">opcional</span>}
          </p>
          <p className="truncate text-xs text-muted-foreground">{conexao.motivo}</p>
        </div>
        {conectada ? (
          <span className="flex items-center gap-1 text-xs text-[#22a35a]">
            <Check size={14} /> Conectado
          </span>
        ) : usaOAuth ? (
          oauth ? (
            <a href={hrefOAuth} target="_blank" rel="noopener" className="btn btn-primary btn-sm shrink-0">
              Conectar <ExternalLink size={12} />
            </a>
          ) : (
            <span className="text-right text-[11px] text-muted-foreground">Disponível em Integrações</span>
          )
        ) : (
          !aberto && (
            <button type="button" onClick={() => setAberto(true)} className="btn btn-primary btn-sm shrink-0">
              Conectar
            </button>
          )
        )}
      </div>
      {!conectada && !usaOAuth && aberto && c.campos?.length ? (
        <form action={acao} className="mt-3 space-y-2">
          {c.campos.map((f) => (
            <label key={f.nome} className="block text-xs text-muted-foreground">
              {f.rotulo}
              <input name={f.nome} type={f.tipo ?? "text"} placeholder={f.placeholder} autoComplete="off" required className="mt-1 h-9 w-full rounded-[10px] border border-border px-3 text-base text-foreground lg:text-sm" />
            </label>
          ))}
          {c.comoObter && <p className="text-[11px] leading-snug text-muted-foreground">{c.comoObter}</p>}
          {estado?.erro && <p className="text-xs text-error">{estado.erro}</p>}
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setAberto(false)} className="text-xs text-muted-foreground hover:text-foreground">
              Deixar pra depois
            </button>
            <button type="submit" disabled={pendente} className="btn btn-primary btn-sm">
              {pendente ? "Testando…" : "Conectar e testar"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
