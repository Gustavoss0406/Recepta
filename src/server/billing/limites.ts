import { orgIlimitada } from "./ilimitado";
import "server-only";
import { and, count, eq, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getPlan, type PlanId } from "@/lib/pricing/plans";
import { resumoCobranca } from "./assinaturas";

export interface Admissao {
  admitida: boolean;
  pico: boolean;
  motivo?: "concorrencia" | "suspensa";
}

const PICO_MULTIPLICADOR = 3; // burst up to 3× the plan's concurrency, billed at 2×

/**
 * Concurrency gate for a new live call. Serialized per organization with an advisory lock so
 * two calls arriving together can't both take the last slot.
 */
export async function admitirChamada(orgId: string, conversaId: string): Promise<Admissao> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${orgId}))`);
    await tx
      .delete(schema.chamadasAtivas)
      .where(and(eq(schema.chamadasAtivas.orgId, orgId), lt(schema.chamadasAtivas.iniciadaEm, new Date(Date.now() - 2 * 3600_000))));
    const [a] = await tx.select().from(schema.assinaturas).where(eq(schema.assinaturas.orgId, orgId));
    if (!orgIlimitada(orgId) && (!a || a.status === "suspensa" || a.status === "cancelada")) return { admitida: false, pico: false, motivo: "suspensa" as const };
    const limite = orgIlimitada(orgId) ? 1000 : (getPlan(a.planoId as PlanId).concurrency ?? 50);
    const [{ n }] = await tx.select({ n: count() }).from(schema.chamadasAtivas).where(eq(schema.chamadasAtivas.orgId, orgId));
    if (n < limite) {
      await tx.insert(schema.chamadasAtivas).values({ conversaId, orgId, pico: false });
      return { admitida: true, pico: false };
    }
    if (a.picoHabilitado && a.status !== "trial" && n < limite * PICO_MULTIPLICADOR) {
      await tx.insert(schema.chamadasAtivas).values({ conversaId, orgId, pico: true });
      return { admitida: true, pico: true };
    }
    return { admitida: false, pico: false, motivo: "concorrencia" as const };
  });
}

export async function liberarChamada(conversaId: string) {
  await getDb().delete(schema.chamadasAtivas).where(eq(schema.chamadasAtivas.conversaId, conversaId));
}

/** Message-only mode when the trial allowance is used up or the monthly cap is reached. */
export async function deveAtenderSoRecado(orgId: string): Promise<boolean> {
  if (orgIlimitada(orgId)) return false;
  const r = await resumoCobranca(orgId);
  if (r.estado === "teto") return true;
  if (r.assinatura.status === "trial" && (r.estado === "esgotada" || r.assinatura.fimCiclo < new Date())) return true;
  return false;
}

/** Raises 80% / 100% / cap alerts once per cycle and drops a notice in the outbox. */
export async function verificarAlertas(orgId: string) {
  const r = await resumoCobranca(orgId);
  const tipos: { tipo: string; mensagem: string }[] = [];
  const pct = r.usadosFranquia / Math.max(1, r.incluidos);
  if (pct >= 0.8) tipos.push({ tipo: "franquia_80", mensagem: `Você usou ${Math.round(pct * 100)}% dos minutos do ciclo.` });
  if (pct >= 1)
    tipos.push({
      tipo: "franquia_100",
      mensagem:
        r.assinatura.status === "trial"
          ? "Os minutos do teste grátis acabaram. A recepcionista passou a só registrar os pedidos para a equipe: escolha um plano para continuar."
          : `A franquia acabou. Os próximos minutos são cobrados a ${r.plano.overageBrl?.toFixed(2).replace(".", ",")} cada.`,
    });
  if (r.estado === "teto") tipos.push({ tipo: "teto", mensagem: "O teto mensal foi atingido. A recepcionista está só registrando os pedidos para a equipe até o próximo ciclo." });
  if (!tipos.length) return [];
  const db = getDb();
  const novos = await db
    .insert(schema.alertas)
    .values(tipos.map((t) => ({ orgId, tipo: t.tipo, mensagem: t.mensagem, cicloInicio: r.assinatura.inicioCiclo })))
    .onConflictDoNothing()
    .returning();
  if (novos.length) {
    const [dono] = await db
      .select({ email: schema.usuarios.email })
      .from(schema.membros)
      .innerJoin(schema.usuarios, eq(schema.usuarios.id, schema.membros.usuarioId))
      .where(and(eq(schema.membros.orgId, orgId), eq(schema.membros.papel, "dono")))
      .limit(1);
    if (dono)
      await db.insert(schema.caixaSaida).values(
        novos.map((n) => ({ orgId, canal: "email" as const, destino: dono.email, assunto: "Aviso de uso da Recepta", corpo: n.mensagem })),
      );
  }
  return novos;
}
