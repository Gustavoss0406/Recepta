import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db/client";
import { sha256 } from "@/server/auth/tokens";
import { hashSenha } from "@/server/auth/password";
import { criarSessao, lerSessao } from "@/server/auth/session";

async function convitePorToken(token: string) {
  const [c] = await getDb()
    .select({ c: schema.convites, org: schema.organizacoes })
    .from(schema.convites)
    .innerJoin(schema.organizacoes, eq(schema.organizacoes.id, schema.convites.orgId))
    .where(and(eq(schema.convites.id, sha256(token)), isNull(schema.convites.aceitoEm), gt(schema.convites.expiraEm, new Date())));
  return c ?? null;
}

async function aceitar(token: string, fd: FormData) {
  "use server";
  const c = await convitePorToken(token);
  if (!c) redirect("/entrar");
  const db = getDb();
  const sessao = await lerSessao();
  let usuarioId = sessao?.usuario.email === c.c.email ? sessao.usuario.id : null;
  if (!usuarioId) {
    const [existe] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, c.c.email));
    if (existe) redirect(`/entrar?convite=${token}`);
    const senha = String(fd.get("senha") ?? "");
    if (senha.length < 8) redirect(`/convite/${token}?erro=senha`);
    const [u] = await db
      .insert(schema.usuarios)
      .values({ email: c.c.email, nome: String(fd.get("nome") ?? c.c.email), senhaHash: await hashSenha(senha) })
      .returning();
    usuarioId = u.id;
  }
  await db.insert(schema.membros).values({ orgId: c.c.orgId, usuarioId, papel: c.c.papel }).onConflictDoNothing();
  await db.update(schema.convites).set({ aceitoEm: new Date() }).where(eq(schema.convites.id, c.c.id));
  await criarSessao(usuarioId, c.c.orgId);
  redirect("/painel");
}

export default async function ConvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const c = await convitePorToken(token);
  if (!c)
    return (
      <>
        <h1 className="display-section">Convite inválido</h1>
        <p className="mt-2 text-muted-foreground">O convite expirou ou já foi usado.</p>
      </>
    );
  return (
    <>
      <h1 className="display-section">Entrar em {c.org.nome}</h1>
      <p className="mt-2 text-[0.9375rem] text-muted-foreground">
        Convite para {c.c.email} como {c.c.papel}.
      </p>
      <form action={aceitar.bind(null, token)} className="mt-8 space-y-4">
        {sp.erro && <p className="text-sm text-error">A senha precisa de pelo menos 8 caracteres.</p>}
        <label className="block">
          <span className="text-sm text-ink">Seu nome</span>
          <input name="nome" className="field mt-1.5" required />
        </label>
        <label className="block">
          <span className="text-sm text-ink">Crie uma senha</span>
          <input name="senha" type="password" minLength={8} className="field mt-1.5" autoComplete="new-password" />
        </label>
        <button type="submit" className="btn btn-primary w-full">
          Aceitar convite
        </button>
      </form>
    </>
  );
}
