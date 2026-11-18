"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, CircleCheck, CircleX, ExternalLink, X } from "lucide-react";
import { acaoConectarIntegracao, acaoDesconectarIntegracao, acaoTestarIntegracao, type R } from "@/app/painel/integracoes/actions";
import { BotaoEnviar } from "@/components/ui/form";
import type { Conector } from "@/lib/integracoes/catalogo";
import { PERMISSOES_GOOGLE, PERMISSOES_ORDEM, type PermissaoGoogle } from "@/lib/integracoes/google-permissoes";
import { cn } from "@/lib/utils";

export interface EstadoConexao {
  status: "conectado" | "erro" | null;
  conta?: string;
  historico?: { quando: string; evento: string; ok: boolean; detalhe: string }[];
}

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", "");

export function Logo({ c, tamanho = 40 }: { c: Pick<Conector, "logo" | "nome">; tamanho?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-[11px] border border-black/[0.06] bg-white" style={{ width: tamanho, height: tamanho }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={c.logo} alt={c.nome} width={tamanho * 0.58} height={tamanho * 0.58} className="object-contain" />
    </span>
  );
}

export function IntegracaoCard({ c, estado, oauthDisponivel, hrefOAuth }: { c: Conector; estado: EstadoConexao; oauthDisponivel: boolean; hrefOAuth?: string }) {
  const [aberto, setAberto] = useState(false);
  const [teste, setTeste] = useState<R>(undefined);
  const [testando, iniciar] = useTransition();
  const conectado = estado.status === "conectado";

  return (
    <article className="flex flex-col rounded-[16px] border border-border bg-background p-4 transition-shadow hover:shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <Logo c={c} />
        {conectado ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e9f7ef] px-2 py-0.5 text-xs text-[#147a3d]">
            <span className="size-1.5 rounded-full bg-[#22a35a]" aria-hidden /> Conectado
          </span>
        ) : estado.status === "erro" ? (
          <span className="rounded-full bg-[#fdecec] px-2 py-0.5 text-xs text-[#b42318]">Reconectar</span>
        ) : c.auth === "oauth" && !oauthDisponivel ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Aguardando app</span>
        ) : null}
      </div>
      <h3 className="mt-3 text-[0.9375rem] font-medium text-foreground">{c.nome}</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{c.descricao}</p>
      {conectado && estado.conta && <p className="mt-2 truncate text-xs text-foreground">{estado.conta}</p>}
      {conectado && estado.historico && estado.historico.length > 0 && (
        <ul className="mt-2 space-y-1">
          {estado.historico.slice(0, 3).map((h, i) => (
            <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {h.ok ? <CircleCheck size={12} className="shrink-0 text-[#22a35a]" /> : <CircleX size={12} className="shrink-0 text-[#e5484d]" />}
              <span className="truncate">
                {quando(h.quando)} · {h.evento === "repasse.criado" ? "caso à equipe" : h.evento === "ligacao.encerrada" ? "ligação" : "teste"} · {h.detalhe}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {conectado || estado.status === "erro" ? (
          <>
            {(
              <button
                type="button"
                disabled={testando}
                onClick={() => iniciar(async () => setTeste(await acaoTestarIntegracao(c.id)))}
                className="h-8 rounded-full border border-border px-3 text-sm hover:bg-accent disabled:opacity-50"
              >
                {testando ? "Testando…" : "Testar"}
              </button>
            )}
            {estado.status === "erro" && c.auth !== "oauth" && (
              <button type="button" onClick={() => setAberto(true)} className="h-8 rounded-full bg-foreground px-3 text-sm font-medium text-white">
                Reconectar
              </button>
            )}
            <form action={acaoDesconectarIntegracao.bind(null, c.id)}>
              <button type="submit" className="h-8 rounded-full px-2 text-sm text-muted-foreground hover:text-destructive">
                Desconectar
              </button>
            </form>
          </>
        ) : c.auth === "oauth" ? (
          <a
            href={oauthDisponivel ? hrefOAuth : undefined}
            aria-disabled={!oauthDisponivel}
            className={cn("inline-flex h-8 items-center rounded-full bg-foreground px-3 text-sm font-medium text-white", !oauthDisponivel && "pointer-events-none opacity-30")}
          >
            Entrar com {c.nome.split(" ")[0]}
          </a>
        ) : c.oauthEnv && oauthDisponivel ? (
          <>
            <a href={hrefOAuth} className="inline-flex h-8 items-center rounded-full bg-foreground px-3 text-sm font-medium text-white hover:bg-foreground/85">
              Entrar com {c.nome.split(" ")[0]}
            </a>
            <button type="button" onClick={() => setAberto(true)} className="h-8 rounded-full px-2 text-sm text-muted-foreground hover:text-foreground">
              Usar token
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setAberto(true)} className="h-8 rounded-full bg-foreground px-3 text-sm font-medium text-white hover:bg-foreground/85">
            Conectar
          </button>
        )}
        {teste && <span className={cn("w-full text-xs", teste.erro ? "text-[#b42318]" : "text-[#147a3d]")}>{teste.erro ?? teste.mensagem}</span>}
      </div>
      {aberto && <FolhaConectar c={c} fechar={() => setAberto(false)} />}
    </article>
  );
}

/** Google: one sign-in, permissions chosen by the business (incremental consent). */
export function GoogleCard({
  c,
  estado,
  permissoes,
  disponivel,
}: {
  c: Conector;
  estado: EstadoConexao;
  permissoes: PermissaoGoogle[];
  disponivel: boolean;
}) {
  const [teste, setTeste] = useState<R>(undefined);
  const [testando, iniciar] = useTransition();
  const conectado = estado.status === "conectado";
  const href = (p: PermissaoGoogle[]) => `/api/integracoes/google?permissoes=${p.join(",")}`;

  return (
    <article className="flex flex-col rounded-[16px] border border-border bg-background p-4 transition-shadow hover:shadow-[var(--shadow-card)] sm:col-span-2 lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <Logo c={c} />
        {conectado ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e9f7ef] px-2 py-0.5 text-xs text-[#147a3d]">
            <span className="size-1.5 rounded-full bg-[#22a35a]" aria-hidden /> Conectado
          </span>
        ) : estado.status === "erro" ? (
          <span className="rounded-full bg-[#fdecec] px-2 py-0.5 text-xs text-[#b42318]">Reconectar</span>
        ) : !disponivel ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Aguardando app</span>
        ) : null}
      </div>
      <h3 className="mt-3 text-[0.9375rem] font-medium text-foreground">{c.nome}</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{conectado && estado.conta ? estado.conta : c.descricao}</p>

      <form action="/api/integracoes/google" method="get" className="mt-3">
        <ul className="divide-y divide-border overflow-hidden rounded-[12px] border border-border">
          {PERMISSOES_ORDEM.map((p) => {
            const tem = permissoes.includes(p);
            return (
              <li key={p} className="flex items-start gap-3 px-3 py-2.5">
                {conectado ? (
                  <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full", tem ? "bg-[#22a35a] text-white" : "border border-border")} aria-hidden>
                    {tem && <Check size={10} strokeWidth={3} />}
                  </span>
                ) : (
                  <input type="checkbox" name="permissoes" value={p} defaultChecked disabled={!disponivel} className="mt-0.5 size-4 accent-foreground" aria-label={PERMISSOES_GOOGLE[p].rotulo} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground">{PERMISSOES_GOOGLE[p].rotulo}</span>
                  <span className="block text-xs text-muted-foreground">{PERMISSOES_GOOGLE[p].descricao}</span>
                </span>
                {conectado && !tem && disponivel && (
                  <a href={href([p])} className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-accent">
                    Permitir
                  </a>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {conectado || estado.status === "erro" ? (
            <>
              <button
                type="button"
                disabled={testando}
                onClick={() => iniciar(async () => setTeste(await acaoTestarIntegracao("google")))}
                className="h-8 rounded-full border border-border px-3 text-sm hover:bg-accent disabled:opacity-50"
              >
                {testando ? "Testando…" : "Testar"}
              </button>
              {estado.status === "erro" && (
                <a href={href(permissoes.length ? permissoes : PERMISSOES_ORDEM)} className="inline-flex h-8 items-center rounded-full bg-foreground px-3 text-sm font-medium text-white">
                  Reconectar
                </a>
              )}
              <button
                type="button"
                onClick={() => iniciar(async () => acaoDesconectarIntegracao("google"))}
                className="h-8 rounded-full px-2 text-sm text-muted-foreground hover:text-destructive"
              >
                Desconectar e revogar acesso
              </button>
            </>
          ) : (
            <button type="submit" disabled={!disponivel} className="inline-flex h-8 items-center rounded-full bg-foreground px-3 text-sm font-medium text-white disabled:opacity-30">
              Entrar com Google
            </button>
          )}
          {teste && <span className={cn("w-full text-xs", teste.erro ? "text-[#b42318]" : "text-[#147a3d]")}>{teste.erro ?? teste.mensagem}</span>}
        </div>
      </form>
      <p className="mt-3 text-xs text-muted-foreground">Você pode revogar a qualquer momento aqui ou em myaccount.google.com/permissions.</p>
    </article>
  );
}

function FolhaConectar({ c, fechar }: { c: Conector; fechar: () => void }) {
  const [estado, acao] = useActionState(acaoConectarIntegracao.bind(null, c.id), undefined);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Conectar ${c.nome}`}>
      <button type="button" className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={fechar} aria-label="Fechar" />
      <form action={acao} className="relative w-full max-w-[460px] rounded-t-[22px] bg-background p-5 shadow-[var(--shadow-float)] sm:rounded-[22px]" autoComplete="off">
        <div className="flex items-center gap-3">
          <Logo c={c} tamanho={36} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Conectar {c.nome}</h2>
            <p className="truncate text-xs text-muted-foreground">{c.faz.join(" · ")}</p>
          </div>
          <button type="button" onClick={fechar} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        {c.comoObter && (
          <p className="mt-4 rounded-[12px] bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <ExternalLink size={11} className="mr-1 inline" />
            {c.comoObter}
          </p>
        )}
        <div className="mt-4 space-y-3">
          {c.campos?.map((f) => (
            <label key={f.nome} className="block">
              <span className="mb-1 block text-sm text-foreground">{f.rotulo}</span>
              <input name={f.nome} type={f.tipo ?? "text"} placeholder={f.placeholder} required className="field" spellCheck={false} />
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Testamos a credencial com o {c.nome} antes de salvar. Ela fica criptografada e só é usada para o que está descrito acima.</p>
        {estado?.erro && <p className="mt-3 rounded-[10px] bg-[#fdecec] px-3 py-2 text-sm text-[#b42318]">{estado.erro}</p>}
        {estado?.ok && <p className="mt-3 rounded-[10px] bg-[#e9f7ef] px-3 py-2 text-sm text-[#147a3d]">{estado.mensagem}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={fechar} className="h-9 rounded-full border border-border px-4 text-sm hover:bg-accent">
            {estado?.ok ? "Fechar" : "Cancelar"}
          </button>
          {!estado?.ok && <BotaoEnviar className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-medium text-white">Testar e conectar</BotaoEnviar>}
        </div>
      </form>
    </div>
  );
}
