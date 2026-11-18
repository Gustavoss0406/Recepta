import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Papel } from "@/db/schema";
import { novoToken, sha256 } from "./tokens";

export const COOKIE_SESSAO = "recepta_sessao";
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000;

export interface Sessao {
  id: string;
  usuario: { id: string; nome: string; email: string; staff: boolean };
  org: { id: string; nome: string; nicho: string; onboardingConcluido: boolean; onboardingPasso: number } | null;
  papel: Papel | null;
}

export async function criarSessao(usuarioId: string, orgId: string | null) {
  const token = novoToken();
  await getDb()
    .insert(schema.sessoes)
    .values({ id: sha256(token), usuarioId, orgId, expiraEm: new Date(Date.now() + DURACAO_MS) });
  (await cookies()).set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_MS / 1000,
  });
}

export async function encerrarSessao() {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) await getDb().delete(schema.sessoes).where(eq(schema.sessoes.id, sha256(token)));
  jar.delete(COOKIE_SESSAO);
}

export async function lerSessao(): Promise<Sessao | null> {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  const db = getDb();
  const [s] = await db
    .select({ sessao: schema.sessoes, usuario: schema.usuarios })
    .from(schema.sessoes)
    .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.sessoes.usuarioId))
    .where(and(eq(schema.sessoes.id, sha256(token)), gt(schema.sessoes.expiraEm, new Date())))
    .limit(1);
  if (!s) return null;

  let org: Sessao["org"] = null;
  let papel: Papel | null = null;
  if (s.sessao.orgId) {
    const [m] = await db
      .select({ org: schema.organizacoes, papel: schema.membros.papel })
      .from(schema.membros)
      .innerJoin(schema.organizacoes, eq(schema.organizacoes.id, schema.membros.orgId))
      .where(and(eq(schema.membros.orgId, s.sessao.orgId), eq(schema.membros.usuarioId, s.usuario.id)))
      .limit(1);
    if (m) {
      org = {
        id: m.org.id,
        nome: m.org.nome,
        nicho: m.org.nicho,
        onboardingConcluido: m.org.onboardingConcluido,
        onboardingPasso: m.org.onboardingPasso,
      };
      papel = m.papel;
    }
  }
  return {
    id: s.sessao.id,
    usuario: { id: s.usuario.id, nome: s.usuario.nome, email: s.usuario.email, staff: s.usuario.staff },
    org,
    papel,
  };
}

export type SessaoComOrg = Sessao & { org: NonNullable<Sessao["org"]>; papel: Papel };

/** For pages and actions inside /painel: requires a logged-in member of an organization. */
export async function exigirSessao(): Promise<SessaoComOrg> {
  const s = await lerSessao();
  if (!s) redirect("/entrar");
  if (!s.org || !s.papel) redirect("/entrar?erro=sem-organizacao");
  return s as SessaoComOrg;
}

export const PERMISSOES = {
  editarAgente: ["dono", "gestor"],
  publicar: ["dono", "gestor"],
  forcarPublicacao: ["dono"],
  verLigacoes: ["dono", "gestor", "atendente"],
  verCobranca: ["dono", "financeiro"],
  gerenciarCobranca: ["dono"],
  gerenciarEquipe: ["dono"],
  configurarLgpd: ["dono"],
  integracoes: ["dono", "gestor"],
} as const satisfies Record<string, readonly Papel[]>;

export type Permissao = keyof typeof PERMISSOES;

export function pode(papel: Papel, p: Permissao): boolean {
  return (PERMISSOES[p] as readonly Papel[]).includes(papel);
}

export async function exigirPermissao(p: Permissao): Promise<SessaoComOrg> {
  const s = await exigirSessao();
  if (!pode(s.papel, p)) throw new Error("Você não tem permissão para fazer isso.");
  return s;
}

export async function exigirStaff() {
  const s = await lerSessao();
  if (!s?.usuario.staff) redirect("/painel");
  return s;
}
