import { FundoFotos, PilhaFotos } from "@/components/painel/capa";
import Link from "next/link";
import { and, desc, eq, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import { Flag, Search } from "lucide-react";
import { getDb, schema } from "@/db/client";
import { exigirPermissao } from "@/server/auth/session";
import { PageHeader, Secao, Vazio } from "@/components/painel/page-header";
import { FiltroPilula, hrefCom } from "@/components/painel/filtros";
import { dataCurta } from "@/components/painel/pendencias";
import { cn } from "@/lib/utils";
import { BadgeResultado, CANAIS } from "@/components/painel/badges";
import { formatDuration } from "@/lib/format";

export const metadata = { title: "Ligações" };

export default async function LigacoesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await exigirPermissao("verLigacoes");
  const sp = await searchParams;
  const c = schema.conversas;
  const filtros: SQL[] = [eq(c.orgId, s.org.id)];
  if (sp.testes !== "1") filtros.push(eq(c.teste, false));
  if (sp.resultado) filtros.push(eq(c.resultado, sp.resultado as "resolvido"));
  if (sp.avaliacao === "sucesso") filtros.push(sql`(${c.avaliacao}->>'sucesso')::boolean = true`);
  if (sp.avaliacao === "falha") filtros.push(sql`(${c.avaliacao}->>'sucesso')::boolean = false`);
  if (sp.sinalizadas === "1") filtros.push(eq(c.sinalizada, true));
  if (sp.periodo) filtros.push(gte(c.iniciadaEm, new Date(Date.now() - Number(sp.periodo) * 86_400_000)));
  if (sp.q) {
    const q = `%${sp.q}%`;
    filtros.push(
      or(
        ilike(c.resumo, q),
        ilike(c.de, q),
        sql`exists (select 1 from ${schema.turnos} t where t.conversa_id = ${c.id} and t.texto ilike ${q})`,
      )!,
    );
  }
  const lista = await getDb()
    .select({ c, mensagens: sql<number>`(select count(*) from ${schema.turnos} t where t.conversa_id = ${c.id} and t.papel in ('cliente', 'agente'))::int` })
    .from(c)
    .where(and(...filtros))
    .orderBy(desc(c.iniciadaEm))
    .limit(100);
  const B = "/painel/ligacoes";

  return (
    <>
      <PageHeader fundo={<FundoFotos slugs={["atendimento", "headset", "recepcao"]} />} titulo="Ligações" descricao="Todas as conversas da recepcionista, com transcrição, resumo, avaliação e resultado." />
      <Secao className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <form className="relative mr-1 w-full sm:w-72">
            {Object.entries(sp)
              .filter(([k, v]) => k !== "q" && v)
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input name="q" defaultValue={sp.q} placeholder="Buscar texto, resumo ou telefone" className="field !h-8 !pl-8 !text-[0.8125rem]" aria-label="Buscar" />
          </form>
          <FiltroPilula base={B} sp={sp} chave="periodo" rotulo="Período" valor={sp.periodo} opcoes={[{ v: "1", t: "24 horas" }, { v: "7", t: "7 dias" }, { v: "30", t: "30 dias" }, { v: "90", t: "90 dias" }]} />
          <FiltroPilula
            base={B}
            sp={sp}
            chave="resultado"
            rotulo="Resultado"
            valor={sp.resultado}
            opcoes={[
              { v: "resolvido", t: "Resolvido" },
              { v: "repassado", t: "Passado à equipe" },
              { v: "transferido", t: "Transferido" },
              { v: "nao_resolvido", t: "Não resolvido" },
            ]}
          />
          <FiltroPilula base={B} sp={sp} chave="avaliacao" rotulo="Avaliação" valor={sp.avaliacao} opcoes={[{ v: "sucesso", t: "Sucesso" }, { v: "falha", t: "Falha" }]} />
          <Link
            href={hrefCom(B, sp, { testes: sp.testes === "1" ? undefined : "1" })}
            className={cn("flex h-7 items-center rounded-[8px] border px-2 text-[0.8125rem]", sp.testes === "1" ? "border-transparent bg-foreground text-white" : "border-border hover:bg-accent")}
          >
            Incluir testes
          </Link>
          <Link
            href={hrefCom(B, sp, { sinalizadas: sp.sinalizadas === "1" ? undefined : "1" })}
            className={cn("flex h-7 items-center gap-1 rounded-[8px] border px-2 text-[0.8125rem]", sp.sinalizadas === "1" ? "border-transparent bg-foreground text-white" : "border-border hover:bg-accent")}
          >
            <Flag size={12} /> Sinalizadas
          </Link>
        </div>
        {lista.length ? (
          <div className="overflow-hidden rounded-[16px] border border-border">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="hidden md:table-header-group">
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="w-[130px] px-4 py-2.5 font-normal">Data</th>
                  <th className="py-2.5 pr-4 font-normal">Conversa</th>
                  <th className="w-[80px] py-2.5 pr-4 font-normal">Duração</th>
                  <th className="w-[90px] py-2.5 pr-4 font-normal">Mensagens</th>
                  <th className="w-[96px] py-2.5 pr-4 font-normal">Avaliação</th>
                  <th className="w-[140px] py-2.5 pr-4 text-right font-normal">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lista.map(({ c: l, mensagens }) => (
                  <tr key={l.id} className="relative transition-colors hover:bg-accent">
                    <td className="hidden px-4 py-3 whitespace-nowrap text-muted-foreground md:table-cell">{dataCurta(l.iniciadaEm)}</td>
                    <td className="px-4 py-3 md:pl-0">
                      <Link href={`/painel/ligacoes/${l.id}`} className="block after:absolute after:inset-0">
                        <span className="line-clamp-2 block text-foreground">
                          {l.sinalizada && <Flag size={12} className="mr-1 inline text-[#e5484d]" aria-label="Sinalizada" />}
                          {l.resumo ?? l.motivo ?? "Em andamento"}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {l.de ?? "Número oculto"} · {CANAIS[l.canal] ?? l.canal}
                          <span className="md:hidden">
                            {" "}
                            · {dataCurta(l.iniciadaEm)} · {formatDuration(l.duracaoS)}
                          </span>
                        </span>
                      </Link>
                      <span className="mt-1.5 flex gap-1.5 md:hidden">
                        <BadgeResultado resultado={l.resultado} />
                      </span>
                    </td>
                    <td className="hidden py-3 pr-4 text-muted-foreground tabular-nums md:table-cell">{formatDuration(l.duracaoS)}</td>
                    <td className="hidden py-3 pr-4 text-muted-foreground tabular-nums md:table-cell">{mensagens}</td>
                    <td className="hidden py-3 pr-4 md:table-cell">
                      {l.avaliacao ? (
                        <span className={cn("rounded-[6px] px-1.5 py-0.5 text-xs font-medium", l.avaliacao.sucesso ? "bg-[#e9f7ef] text-[#147a3d]" : "bg-[#fdecec] text-[#b42318]")}>
                          {l.avaliacao.sucesso ? "Sucesso" : "Falha"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="hidden py-3 pr-4 text-right md:table-cell">
                      <BadgeResultado resultado={l.resultado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio imagem={<PilhaFotos slugs={["atendimento", "headset", "recepcao"]} />} titulo="Nenhuma ligação encontrada" texto="Ajuste os filtros, ou inclua os testes para ver conversas do painel Testar." />
        )}
      </Secao>
    </>
  );
}
