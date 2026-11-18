import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { novoBancoDeTeste } from "../../../test/db";
import { schema, type Db } from "@/db/client";
import { criarConta } from "@/server/auth/conta";
import { criarAgente } from "@/server/agent/agentes";
import { aplicarRetencao } from "./tarefas";

let db: Db;

async function conversa(orgId: string, agenteId: string, diasAtras: number) {
  const [c] = await db
    .insert(schema.conversas)
    .values({
      orgId,
      agenteId,
      canal: "telefone",
      teste: false,
      de: "+5511999990000",
      resumo: "resumo",
      dados: { nome: "Maria" },
      estado: { mensagens: [] },
      iniciadaEm: new Date(Date.now() - diasAtras * 86_400_000),
    })
    .returning();
  await db.insert(schema.turnos).values({ orgId, conversaId: c.id, ordem: 0, papel: "cliente", texto: "oi" });
  return c.id;
}

beforeAll(async () => {
  db = await novoBancoDeTeste();
});

describe("Retenção LGPD", () => {
  it("expira só o que passou do prazo de cada organização", async () => {
    const a = await criarConta({ nome: "Ana", email: "a@ret.com", senha: "senhaforte1", empresa: "Org A", nicho: "clinica" });
    const b = await criarConta({ nome: "Bia", email: "b@ret.com", senha: "senhaforte1", empresa: "Org B", nicho: "clinica" });
    await db.update(schema.organizacoes).set({ retencaoTranscricaoDias: 30 }).where(eq(schema.organizacoes.id, a.orgId));
    const agA = (await criarAgente(a.orgId, "clinica", { nome: "Org A" })).id;
    const agB = (await criarAgente(b.orgId, "clinica", { nome: "Org B" })).id;
    const velhaA = await conversa(a.orgId, agA, 40);
    const novaA = await conversa(a.orgId, agA, 2);
    const novaB = await conversa(b.orgId, agB, 40); // org B keeps 365 days

    expect(await aplicarRetencao()).toBe(1);
    const ler = async (id: string) => (await db.select().from(schema.conversas).where(eq(schema.conversas.id, id)))[0];
    expect((await ler(velhaA)).resumo).toContain("expirado");
    expect((await ler(velhaA)).dados).toBeNull();
    expect(await db.select().from(schema.turnos).where(eq(schema.turnos.conversaId, velhaA))).toHaveLength(0);
    expect((await ler(novaA)).dados).toEqual({ nome: "Maria" });
    expect((await ler(novaB)).dados).toEqual({ nome: "Maria" });
    expect(await aplicarRetencao()).toBe(0); // idempotent
  });
});
