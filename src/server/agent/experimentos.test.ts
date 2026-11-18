import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { novoBancoDeTeste } from "../../../test/db";
import { schema, type Db } from "@/db/client";
import { criarConta } from "@/server/auth/conta";
import { criarAgente, obterAgente, publicar, salvarRascunho, versoesDoAgente } from "./agentes";
import { encerrarExperimento, iniciarExperimento, resultadoExperimento, versaoParaNovaChamada } from "./experimentos";
import { encerrarConversa, iniciarConversa } from "./runtime";

let db: Db;
let orgId: string;
let agenteId: string;
const dono = { id: "u", papel: "dono" as const };

beforeAll(async () => {
  db = await novoBancoDeTeste();
  ({ orgId } = await criarConta({ nome: "Ana", email: "ana@ab.com", senha: "senhaforte1", empresa: "Clínica AB", nicho: "clinica" }));
  agenteId = (await criarAgente(orgId, "clinica", { nome: "Clínica AB", cidade: "Campinas" })).id;
});

describe("Experimentos A/B", () => {
  it("divide o tráfego, fixa a versão da ligação e promove a vencedora", async () => {
    const v1 = await publicar(orgId, agenteId, dono);
    const a0 = await obterAgente(orgId, agenteId);
    await salvarRascunho(orgId, agenteId, { comportamento: { ...a0.rascunho.comportamento, tom: "formal" } });
    const v2 = await publicar(orgId, agenteId, dono);

    await expect(iniciarExperimento(orgId, agenteId, v2.id, 50)).rejects.toThrow(/diferente/);
    const e = await iniciarExperimento(orgId, agenteId, v1.id, 5);
    expect(e.percentualB).toBe(10); // clamped to 10–90 %
    await expect(iniciarExperimento(orgId, agenteId, v1.id, 30)).rejects.toThrow(/andamento/);

    expect(await versaoParaNovaChamada(orgId, agenteId, 0.05)).toBe(v1.id);
    expect(await versaoParaNovaChamada(orgId, agenteId, 0.5)).toBe(v2.id);

    // a real call is pinned to the version it started on
    const ini = await iniciarConversa({ orgId, agenteId, canal: "telefone" });
    const [c] = await db.select().from(schema.conversas).where(eq(schema.conversas.id, ini.conversaId));
    expect([v1.id, v2.id]).toContain(c.versaoId);
    await encerrarConversa(ini.conversaId, { duracaoS: 30 });
    const r = await resultadoExperimento(agenteId);
    expect(r!.a.ligacoes + r!.b.ligacoes).toBe(1);
    expect(r!.a.numero).toBe(v2.numero);

    await encerrarExperimento(orgId, agenteId, { promover: "B", autor: dono });
    const a = await obterAgente(orgId, agenteId);
    const vs = await versoesDoAgente(orgId, agenteId);
    const publicada = vs.find((v) => v.id === a.versaoPublicadaId)!;
    expect(publicada.numero).toBe(3);
    expect(publicada.config.comportamento.tom).toBe(v1.config.comportamento.tom);
    expect(await resultadoExperimento(agenteId)).toBeNull();
    expect(await versaoParaNovaChamada(orgId, agenteId, 0)).toBe(a.versaoPublicadaId);
  });
});
