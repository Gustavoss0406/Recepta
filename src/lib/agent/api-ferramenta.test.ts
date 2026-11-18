import { describe, expect, it } from "vitest";
import { definicaoFerramenta, ferramentaApiSchema, filtrarResposta, listarCampos, montarRequisicao, type FerramentaApi } from "./api-ferramenta";

const base: FerramentaApi = ferramentaApiSchema.parse({
  id: "abc12345",
  nome: "consultar_pedido",
  descricao: "Consulta o status de um pedido pelo número",
  nivel: "consultar",
  metodo: "GET",
  url: "https://api.loja.com/pedidos/{numero}",
  parametros: [
    { nome: "numero", descricao: "Número do pedido", obrigatorio: true },
    { nome: "cpf", descricao: "CPF", obrigatorio: false },
  ],
  campos: ["status", "entrega.previsao"],
});

describe("Ferramentas de API", () => {
  it("encaixa e codifica parâmetros no endereço; o resto vai na consulta", () => {
    expect(montarRequisicao(base, { numero: "12/3 x", cpf: "123" })).toEqual({ url: "https://api.loja.com/pedidos/12%2F3%20x?cpf=123", metodo: "GET" });
    expect(() => montarRequisicao(base, {})).toThrow(/numero/);
    const post = montarRequisicao({ ...base, metodo: "POST", url: "https://api.loja.com/leads" }, { numero: "9" });
    expect(post).toEqual({ url: "https://api.loja.com/leads", metodo: "POST", corpo: '{"numero":"9"}' });
  });

  it("modelo do Supabase: placeholder dentro da consulta", () => {
    const f = { ...base, url: "https://x.supabase.co/rest/v1/imoveis?select=*&bairro=ilike.*{numero}*&limit=5" };
    expect(montarRequisicao(f, { numero: "Vila Nova" }).url).toContain("bairro=ilike.*Vila%20Nova*");
  });

  it("só os campos liberados chegam à recepcionista", () => {
    const r = filtrarResposta({ status: "enviado", cpf: "123.456.789-00", entrega: { previsao: "sexta", endereco: "Rua X" } }, base.campos);
    expect(r).toEqual({ status: "enviado", "entrega.previsao": "sexta" });
    const lista = filtrarResposta([{ titulo: "Casa", preco: 1, dono: "x" }, { titulo: "Apto", preco: 2, dono: "y" }], ["titulo", "preco"]);
    expect(lista).toEqual({ "itens.titulo": ["Casa", "Apto"], "itens.preco": [1, 2], total: 2 });
    expect(filtrarResposta({ texto: "x".repeat(5000) }, ["texto"])).toMatchObject({ aviso: "resposta cortada" });
  });

  it("lista os campos de uma resposta de exemplo", () => {
    expect(listarCampos([{ a: 1, b: { c: 2 } }])).toEqual(["a", "b.c"]);
  });

  it("ações que registram exigem confirmação do cliente na definição", () => {
    const d = definicaoFerramenta({ ...base, nivel: "registrar" });
    expect(d.input_schema.required).toContain("cliente_confirmou");
    expect(d.description).toMatch(/confirmação/);
    expect(definicaoFerramenta(base).input_schema.required).toEqual(["numero"]);
  });

  it("recusa nomes e endereços inválidos", () => {
    expect(ferramentaApiSchema.safeParse({ ...base, nome: "Consultar Pedido" }).success).toBe(false);
    expect(ferramentaApiSchema.safeParse({ ...base, url: "nao-e-url" }).success).toBe(false);
  });
});
