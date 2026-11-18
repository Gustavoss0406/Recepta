import Link from "next/link";
import { ChevronRight, Plus, Search } from "lucide-react";
import { exigirSessao, pode } from "@/server/auth/session";
import { listarAgentes } from "@/server/agent/agentes";
import { BOTAO, PageHeader, Secao, Vazio } from "@/components/painel/page-header";
import { Orb } from "@/components/ui/orb";
import { getVoice } from "@/lib/voices";
import { NICHOS_DEF } from "@/lib/niches";
import type { Nicho } from "@/lib/agent/config";
import { dataCurta } from "@/components/painel/pendencias";
import { cn } from "@/lib/utils";
import { acaoNovoAgente } from "../actions";

export const metadata = { title: "Agentes" };

const STATUS = {
  publicado: { t: "No ar", c: "bg-[#e9f7ef] text-[#147a3d]" },
  pausado: { t: "Pausada", c: "bg-[#fdf6d8] text-[#7a5b00]" },
  rascunho: { t: "Rascunho", c: "bg-muted text-muted-foreground" },
} as const;

export default async function AgentesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await exigirSessao();
  const { q } = await searchParams;
  const todos = await listarAgentes(s.org.id);
  const agentes = q ? todos.filter((a) => a.nome.toLowerCase().includes(q.toLowerCase())) : todos;
  const editar = pode(s.papel, "editarAgente");
  return (
    <>
      <PageHeader
        titulo="Agentes"
        descricao="Cada recepcionista tem sua voz, conhecimento, regras e número."
        acoes={
          editar && (
            <form action={acaoNovoAgente} className="flex items-center gap-2">
              <select name="nicho" defaultValue={s.org.nicho} className="field !h-9 !w-40 !rounded-full" aria-label="Modelo do novo agente">
                {Object.values(NICHOS_DEF).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nome}
                  </option>
                ))}
              </select>
              <button type="submit" className={BOTAO.primario}>
                <Plus size={15} /> Novo agente
              </button>
            </form>
          )
        }
      />
      <Secao>
        {todos.length ? (
          <>
            <form className="relative mb-3 max-w-sm">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input name="q" defaultValue={q} placeholder="Buscar agentes" aria-label="Buscar agentes" className="field !h-9 !pl-9" />
            </form>
            <div className="overflow-hidden rounded-[16px] border border-border">
              <table className="w-full table-fixed text-left">
                <thead className="hidden sm:table-header-group">
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-normal">Nome</th>
                    <th className="w-[160px] py-2.5 pr-4 font-normal">Voz</th>
                    <th className="w-[110px] py-2.5 pr-4 font-normal">Status</th>
                    <th className="w-[140px] py-2.5 pr-4 font-normal">Alterado</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {agentes.map((a) => {
                    const v = getVoice(a.rascunho.voz.vozId);
                    const st = STATUS[a.status];
                    return (
                      <tr key={a.id} className="group relative transition-colors hover:bg-accent">
                        <td className="px-4 py-3">
                          <Link href={`/painel/agentes/${a.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                            <Orb tom={v?.tone ?? "padrao"} tamanho={32} />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-foreground">{a.nome}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {NICHOS_DEF[a.nicho as Nicho]?.nome}
                                <span className="sm:hidden"> · {st.t}</span>
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="hidden truncate py-3 pr-4 text-sm text-foreground sm:table-cell">{v?.name ?? "—"}</td>
                        <td className="hidden py-3 pr-4 sm:table-cell">
                          <span className={cn("rounded-[6px] px-1.5 py-0.5 text-xs font-medium", st.c)}>{st.t}</span>
                        </td>
                        <td className="hidden py-3 pr-4 text-sm text-muted-foreground sm:table-cell">{dataCurta(a.rascunhoAlteradoEm)}</td>
                        <td className="w-10 pr-3 text-muted-foreground">
                          <ChevronRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                        </td>
                      </tr>
                    );
                  })}
                  {agentes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Nenhum agente com “{q}”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <Vazio
            titulo="Nenhum agente"
            texto="Comece pelo assistente de configuração."
            acao={
              <Link href="/painel/comecar" className={BOTAO.primario}>
                Configurar recepcionista
              </Link>
            }
          />
        )}
      </Secao>
    </>
  );
}
