import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { novoBancoDeTeste } from "../../../test/db";
import { schema, type Db } from "@/db/client";
import { criarConta } from "@/server/auth/conta";
import { obterAssinatura } from "./assinaturas";
import { assinarPlano, fecharCiclosVencidos, processarInadimplencia, registrarPagamento } from "./faturamento";
import { admitirChamada } from "./limites";

let db: Db;
let orgId: string;
beforeAll(async () => {
  db = await novoBancoDeTeste();
  ({ orgId } = await criarConta({ nome: "Eva", email: "eva@pizza.com", senha: "senhaforte1", empresa: "Pizzaria Eva", nicho: "restaurante" }));
});

describe("Faturamento ponta a ponta (gateway simulado)", () => {
  const t0 = new Date("2026-11-01T12:00:00Z");

  it("assinar o Start cobra o plano adiantado", async () => {
    const f = await assinarPlano(orgId, "start", "mensal", t0);
    expect(f.totalCentavos).toBe(19700);
    expect(f.status).toBe("aberta");
    expect(f.linkPagamento).toContain(`/painel/cobranca/pagar/${f.id}`);
    expect((await obterAssinatura(orgId)).status).toBe("ativa");
    await registrarPagamento(f.id, t0);
  });

  it("fechar o ciclo cobra excedente + próximo plano e avança o ciclo", async () => {
    // 230 min reais + 4 min de pico no ciclo
    await db.insert(schema.conversas).values([
      { orgId, agenteId: "a", canal: "telefone", status: "encerrada", minutosCobrados: 230, iniciadaEm: new Date("2026-11-10T12:00:00Z") },
      { orgId, agenteId: "a", canal: "telefone", status: "encerrada", minutosCobrados: 4, pico: true, iniciadaEm: new Date("2026-11-11T12:00:00Z") },
    ]);
    const [f] = await fecharCiclosVencidos(new Date("2026-12-01T13:00:00Z"));
    expect(f.itens.map((i) => i.descricao)).toEqual(["Minutos excedentes", "Minutos em pico (acima das chamadas simultâneas)", "Plano Start (mensal)"]);
    expect(f.totalCentavos).toBe(30 * 99 + 4 * 198 + 19700);
    const a = await obterAssinatura(orgId);
    expect(a.inicioCiclo.toISOString()).toBe("2026-12-01T12:00:00.000Z");
    expect(a.fimCiclo.toISOString()).toBe("2027-01-01T12:00:00.000Z");
  });

  it("fatura vencida → inadimplente → suspensa (recusa chamadas) → pagamento reativa", async () => {
    const [aberta] = await db.select().from(schema.faturas).where(eq(schema.faturas.status, "aberta"));
    await processarInadimplencia(new Date("2026-12-05T13:00:00Z"));
    expect((await obterAssinatura(orgId)).status).toBe("inadimplente");
    await processarInadimplencia(new Date("2026-12-12T13:00:00Z"));
    expect((await obterAssinatura(orgId)).status).toBe("suspensa");
    expect((await admitirChamada(orgId, "conv-x")).admitida).toBe(false);
    await registrarPagamento(aberta.id);
    expect((await obterAssinatura(orgId)).status).toBe("ativa");
  });
});
