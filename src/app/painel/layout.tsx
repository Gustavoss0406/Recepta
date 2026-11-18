import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { Sidebar } from "@/components/painel/sidebar";
import { exigirSessao } from "@/server/auth/session";
import { resumoCobranca } from "@/server/billing/assinaturas";
import { acaoSair } from "@/app/(auth)/actions";

export const metadata = { title: "Painel" };

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const s = await exigirSessao();
  const [r, [{ n: pendencias }]] = await Promise.all([
    resumoCobranca(s.org.id),
    getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.repasses)
      .where(and(eq(schema.repasses.orgId, s.org.id), eq(schema.repasses.status, "pendente"))),
  ]);
  return (
    <div className="min-h-dvh bg-background lg:flex">
      <Sidebar
        orgNome={s.org.nome}
        usuarioNome={s.usuario.nome}
        usuarioEmail={s.usuario.email}
        papel={s.papel}
        pendencias={pendencias}
        uso={{ usados: r.usadosFranquia, incluidos: r.incluidos, plano: r.plano.name, trial: r.assinatura.status === "trial" }}
        sair={acaoSair}
      />
      <div className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</div>
    </div>
  );
}
