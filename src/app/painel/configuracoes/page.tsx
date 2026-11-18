import { desc, eq, isNull, and } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exigirSessao, pode } from "@/server/auth/session";
import { PageHeader, Secao } from "@/components/painel/page-header";
import { Grupo } from "@/components/painel/secoes";
import { Convidar, Lgpd, NovaChave } from "@/components/painel/config-forms";
import { alterarPapel, removerMembro, revogarChave } from "./actions";

export const metadata = { title: "Configurações" };

export default async function ConfiguracoesPage() {
  const s = await exigirSessao();
  const db = getDb();
  const [org] = await db.select().from(schema.organizacoes).where(eq(schema.organizacoes.id, s.org.id));
  const membros = await db
    .select({ id: schema.usuarios.id, nome: schema.usuarios.nome, email: schema.usuarios.email, papel: schema.membros.papel })
    .from(schema.membros)
    .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.membros.usuarioId))
    .where(eq(schema.membros.orgId, s.org.id));
  const convites = await db
    .select()
    .from(schema.convites)
    .where(and(eq(schema.convites.orgId, s.org.id), isNull(schema.convites.aceitoEm)));
  const chaves = await db.select().from(schema.chavesApi).where(eq(schema.chavesApi.orgId, s.org.id)).orderBy(desc(schema.chavesApi.criadoEm));
  const auditoria = await db.select().from(schema.auditoria).where(eq(schema.auditoria.orgId, s.org.id)).orderBy(desc(schema.auditoria.criadoEm)).limit(15);
  const equipe = pode(s.papel, "gerenciarEquipe");

  return (
    <>
      <PageHeader titulo="Configurações" descricao={`${org.nome}${org.cnpj ? ` · CNPJ ${org.cnpj}` : ""}`} />
      <Secao className="space-y-12">
        <Grupo titulo="Equipe" ajuda="Dono: tudo. Gestor: agentes e testes. Atendente: ligações. Financeiro: cobrança.">
          <ul className="divide-y divide-hairline rounded-[12px] bg-white shadow-[var(--shadow-pill)]">
            {membros.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{m.nome}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
                {equipe && m.id !== s.usuario.id ? (
                  <>
                    <form action={alterarPapel.bind(null, m.id)} className="flex gap-1">
                      <select name="papel" defaultValue={m.papel} className="field !h-8 !w-32 text-xs" aria-label={`Papel de ${m.nome}`}>
                        <option value="dono">Dono</option>
                        <option value="gestor">Gestor</option>
                        <option value="atendente">Atendente</option>
                        <option value="financeiro">Financeiro</option>
                      </select>
                      <button type="submit" className="btn btn-sm btn-secondary !h-8 text-xs">
                        Salvar
                      </button>
                    </form>
                    <form action={removerMembro.bind(null, m.id)}>
                      <button type="submit" className="text-xs text-error underline">
                        Remover
                      </button>
                    </form>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground capitalize">{m.papel}</span>
                )}
              </li>
            ))}
            {convites.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground">
                {c.email} · convite pendente ({c.papel})
              </li>
            ))}
          </ul>
          {equipe && <Convidar />}
        </Grupo>

        {pode(s.papel, "configurarLgpd") && (
          <Grupo titulo="Privacidade (LGPD)" ajuda="Dados expirados são apagados automaticamente. A exclusão por titular fica em cada ligação.">
            <Lgpd audio={org.retencaoAudioDias} transcricao={org.retencaoTranscricaoDias} mascarar={org.mascararDados} />
          </Grupo>
        )}

        {pode(s.papel, "integracoes") && (
          <Grupo titulo="Chaves de API" ajuda="Para a API pública v1 (Authorization: Bearer <chave>).">
            <NovaChave />
            {chaves.length > 0 && (
              <ul className="divide-y divide-hairline rounded-[12px] bg-white text-sm shadow-[var(--shadow-pill)]">
                {chaves.map((k) => (
                  <li key={k.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="font-mono text-xs">{k.prefixo}.••••</span>
                    <span className="flex-1 text-muted-foreground">{k.nome}</span>
                    {k.revogadaEm ? (
                      <span className="text-xs text-muted-foreground">revogada</span>
                    ) : (
                      <form action={revogarChave.bind(null, k.id)}>
                        <button type="submit" className="text-xs text-error underline">
                          Revogar
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Grupo>
        )}

        <Grupo titulo="Registro de atividades" ajuda="Ações sensíveis ficam registradas.">
          <ul className="space-y-1 text-xs text-body">
            {auditoria.map((a) => (
              <li key={a.id}>
                <span className="text-muted-foreground">{a.criadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</span> · {a.acao}
              </li>
            ))}
          </ul>
        </Grupo>
      </Secao>
    </>
  );
}
