import "server-only";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ADAPTADORES, finalTelefone, type ContatoCrm } from "@/server/integracoes/conectores";
import { credenciaisDe } from "@/server/integracoes/servico";

/** CRMs that can look a caller up by phone. */
export const CRMS_IDENTIFICACAO = ["hubspot", "pipedrive"];

export interface ClienteIdentificado {
  nome?: string;
  email?: string;
  /** Previous calls to this company (newest first): date, result, summary. */
  ligacoes: { quando: string; resultado: string | null; resumo: string | null }[];
  /** Cases handed to the team for this phone, with their status (did anyone call back?). */
  pendencias: { quando: string; titulo: string; status: string; nota: string | null }[];
  crm: ContatoCrm[];
}

const comLimite = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/**
 * Who is calling: the company's own call history (always available, free) plus every connected
 * CRM, each with a short timeout so a slow CRM never delays the call.
 */
export async function identificarCliente(orgId: string, telefone: string | null | undefined, opts: { excluirConversa?: string; limiteMs?: number } = {}): Promise<ClienteIdentificado | null> {
  const fim = finalTelefone(telefone);
  if (fim.length < 8) return null;
  const c = schema.conversas;
  const historico = getDb()
    .select({ quando: c.iniciadaEm, resultado: c.resultado, resumo: c.resumo })
    .from(c)
    .where(
      and(
        eq(c.orgId, orgId),
        eq(c.teste, false),
        sql`right(regexp_replace(coalesce(${c.de}, ''), '\\D', '', 'g'), 8) = ${fim}`,
        ...(opts.excluirConversa ? [ne(c.id, opts.excluirConversa)] : []),
      ),
    )
    .orderBy(desc(c.iniciadaEm))
    .limit(3);
  const r = schema.repasses;
  const pendencias = getDb()
    .select({ quando: r.criadoEm, titulo: r.titulo, status: r.status, nota: r.nota })
    .from(r)
    .where(and(eq(r.orgId, orgId), sql`right(regexp_replace(coalesce(${r.contatoTelefone}, ''), '\\D', '', 'g'), 8) = ${fim}`))
    .orderBy(desc(r.criadoEm))
    .limit(3);
  const crms = CRMS_IDENTIFICACAO.map(async (id) => {
    const a = ADAPTADORES[id];
    if (!a?.buscarContato) return null;
    const cred = await credenciaisDe(orgId, id);
    if (!cred) return null;
    return comLimite(a.buscarContato(cred, telefone!).catch(() => null), opts.limiteMs ?? 2500);
  });
  const [ligacoes, pend, ...achados] = await Promise.all([historico, pendencias, ...crms]);
  const crm = achados.filter((x): x is ContatoCrm => Boolean(x));
  if (!ligacoes.length && !crm.length && !pend.length) return null;
  return {
    nome: crm.find((x) => x.nome)?.nome,
    email: crm.find((x) => x.email)?.email,
    ligacoes: ligacoes.map((l) => ({ quando: l.quando.toISOString().slice(0, 10), resultado: l.resultado, resumo: l.resumo })),
    pendencias: (pend as { quando: Date; titulo: string; status: string; nota: string | null }[]).map((p) => ({ quando: p.quando.toISOString().slice(0, 10), titulo: p.titulo, status: p.status, nota: p.nota })),
    crm,
  };
}

const STATUS = { pendente: "a equipe AINDA NÃO retornou", em_andamento: "a equipe está cuidando", resolvido: "resolvido" } as Record<string, string>;

/**
 * Context for the model. She may say she sees the earlier contact and its subject (the call comes
 * from the same phone); personal data and amounts only after the caller confirms who they are.
 */
export function contextoCliente(c: ClienteIdentificado): string {
  const linhas = [
    `Cliente reconhecido pelo telefone${c.nome ? `: provavelmente ${c.nome}` : ""}. Use isso para atender melhor: diga que vê o contato anterior e o assunto${c.nome ? ` e confirme o nome ("Falo com ${c.nome.split(" ")[0]}?")` : ""}.`,
    "Dados pessoais, valores e detalhes do cadastro só depois de o cliente confirmar quem é.",
    ...c.ligacoes.map((l) => `- Ligação em ${l.quando}: ${l.resultado ?? "—"}${l.resumo ? ` — ${l.resumo}` : ""}`),
    ...c.pendencias.map((p) => `- Caso passado à equipe em ${p.quando}: ${p.titulo} → ${STATUS[p.status] ?? p.status}${p.nota ? ` (${p.nota})` : ""}`),
    c.pendencias.some((p) => p.status === "pendente")
      ? "Se o cliente cobrar o retorno: peça desculpas pela demora e use repassar_para_equipe com urgência alta, citando o caso anterior."
      : "",
    ...c.crm.flatMap((x) => x.detalhes.map((d) => `- ${x.fonte}: ${d}`)),
  ];
  return linhas.join("\n");
}
