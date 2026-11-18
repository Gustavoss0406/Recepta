import { describe, expect, it } from "vitest";
import { avaliarCondicao, iniciarFluxo, lerExpressao, retomarAposAcao, validarWorkflow, varsDeResultado, type Workflow } from "./workflow";

describe("Condições do fluxo", () => {
  const v = { dentro_do_horario: "sim", "consultar_pedido.status": "Enviado", "orc.valor": "650,50", cliente_identificado: "nao" };
  it("compara texto (sem acento/maiúsculas), números, sim/não e existência", () => {
    expect(avaliarCondicao("consultar_pedido.status = enviado", v)).toBe(true);
    expect(avaliarCondicao("consultar_pedido.status != enviado", v)).toBe(false);
    expect(avaliarCondicao("orc.valor > 500", v)).toBe(true);
    expect(avaliarCondicao("orc.valor <= 500", v)).toBe(false);
    expect(avaliarCondicao("dentro_do_horario = true", v)).toBe(true);
    expect(avaliarCondicao("cliente_identificado", v)).toBe(false);
    expect(avaliarCondicao("consultar_pedido.status contém envi", v)).toBe(true);
    expect(avaliarCondicao("nao_existe = x", v)).toBe(false);
    expect(avaliarCondicao("nao_existe != x", v)).toBe(true);
    expect(lerExpressao("isso não é uma condição")).toBeNull();
  });

  it("resultado de ferramenta vira dado", () => {
    expect(varsDeResultado("consultar_pedido", { ok: true, status: 200, dados: { status: "enviado", itens: ["a", "b"] } })).toEqual({
      consultar_pedido: "sucesso",
      "consultar_pedido.status": "enviado",
      "consultar_pedido.itens": "a, b",
    });
    expect(varsDeResultado("x", { ok: false, erro: "Não encontrado" })).toMatchObject({ x: "falha" });
  });

  const wf: Workflow = {
    ativo: true,
    nos: [
      { id: "ini", tipo: "inicio", x: 0, y: 0, titulo: "", texto: "" },
      { id: "horario", tipo: "condicao", x: 0, y: 0, titulo: "Horário", texto: "" },
      { id: "consulta", tipo: "acao", x: 0, y: 0, titulo: "", texto: "consultar_pedido" },
      { id: "status", tipo: "condicao", x: 0, y: 0, titulo: "Status", texto: "" },
      { id: "falaEnviado", tipo: "falar", x: 0, y: 0, titulo: "", texto: "Seu pedido já saiu para entrega." },
      { id: "atendente", tipo: "subagente", x: 0, y: 0, titulo: "Atendimento", texto: "Ajude o cliente." },
      { id: "fora", tipo: "falar", x: 0, y: 0, titulo: "", texto: "Estamos fora do horário." },
      { id: "fim", tipo: "fim", x: 0, y: 0, titulo: "", texto: "" },
    ],
    arestas: [
      { id: "a1", de: "ini", para: "horario", condicao: "" },
      { id: "a2", de: "horario", para: "consulta", condicao: "dentro_do_horario = sim" },
      { id: "a3", de: "horario", para: "fora", condicao: "" },
      { id: "a4", de: "fora", para: "fim", condicao: "" },
      { id: "a5", de: "consulta", para: "status", condicao: "sucesso" },
      { id: "a6", de: "consulta", para: "atendente", condicao: "falha" },
      { id: "a7", de: "status", para: "falaEnviado", condicao: "consultar_pedido.status = enviado" },
      { id: "a8", de: "status", para: "atendente", condicao: "senão" },
      { id: "a9", de: "falaEnviado", para: "fim", condicao: "" },
      { id: "a10", de: "atendente", para: "fim", condicao: "O cliente não precisa de mais nada" },
    ],
  };

  it("percorre: horário → consulta → status decide a frase", () => {
    expect(validarWorkflow(wf)).toEqual([]);
    expect(iniciarFluxo(wf, { dentro_do_horario: "nao" }).efeitos).toEqual([{ tipo: "falar", texto: "Estamos fora do horário." }, { tipo: "fim" }]);
    const ini = iniciarFluxo(wf, { dentro_do_horario: "sim" });
    expect(ini).toEqual({ atual: "consulta", efeitos: [{ tipo: "acao", ferramenta: "consultar_pedido", noId: "consulta" }] });
    const ok = retomarAposAcao(wf, "consulta", true, { "consultar_pedido.status": "enviado" });
    expect(ok.efeitos).toEqual([{ tipo: "falar", texto: "Seu pedido já saiu para entrega." }, { tipo: "fim" }]);
    expect(retomarAposAcao(wf, "consulta", true, { "consultar_pedido.status": "separando" }).atual).toBe("atendente");
    expect(retomarAposAcao(wf, "consulta", false, {}).atual).toBe("atendente");
  });

  it("valida condições mal escritas e dois 'senão'", () => {
    const ruim = { ...wf, arestas: [...wf.arestas, { id: "x", de: "status", para: "fim", condicao: "" }, { id: "y", de: "horario", para: "fim", condicao: "isso não é condição" }] };
    const erros = validarWorkflow(ruim).join(" ");
    expect(erros).toMatch(/Condição inválida em "Horário": isso não é condição/);
    expect(erros).toMatch(/"Status" tem mais de um caminho "senão"/);
  });
});
