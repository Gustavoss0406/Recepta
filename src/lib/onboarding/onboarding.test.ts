import { describe, expect, it } from "vitest";
import { validarWorkflow, workflowSchema } from "@/lib/agent/workflow";
import { finalizar, iniciar, pularPergunta, responder, type EstadoOnboarding } from "./conversa";
import { gerarFluxo } from "./gerador";
import { lerHorario, valorEmReais } from "./perfil";
import { categoriaDe, PERGUNTAS, roteiro } from "./perguntas";

/** Answers each question with the scripted reply for its id (or skips it). */
function conversar(respostas: Record<string, string | string[]>, limite = 60) {
  let e: EstadoOnboarding = iniciar();
  const perguntas: string[] = [];
  const fila = Object.fromEntries(Object.entries(respostas).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  for (let i = 0; i < limite && !e.concluido; i++) {
    const id = e.perguntaAtual!;
    perguntas.push(id);
    const r = fila[id]?.shift();
    e = r === undefined ? pularPergunta(e) : responder(e, r);
  }
  return { e, perguntas };
}

const IMOBILIARIA = {
  negocio: "Tenho uma imobiliária",
  empresa: "Imobiliária Lar, em Campinas",
  servicos: "Apartamentos e casas de 300 mil a 3 milhões; salas comerciais",
  motivos: "saber de imóvel; marcar visita; boleto do aluguel; vistoria de saída",
  horario: "seg a sex 9h às 18h, sábado 9 às 13",
  agenda: "Sim, pode marcar",
  fora: "Tem plantão pra urgência, (19) 99876-5432",
  pessoa: "Transfere pro (19) 3232-1000",
  site: "imobiliarialar.com.br",
  recepcionista: "Lia, descontraída",
  imob_operacao: "Os dois",
  imob_regioes: "Cambuí; Taquaral; Barão Geraldo",
  imob_alto_padrao: "Acima de 2 milhões, passa pro corretor sênior",
  imob_financiamento: "Explica o básico",
  imob_visita: "Levar documento com foto e ir com o corretor",
  imob_captacao: "Quero esses contatos!",
  imob_inquilino: "Urgência passa na hora, boleto anota",
  vip: "Sim, investidores que já compraram com a gente têm prioridade",
  reclamacao: "O gerente, em até 24h",
  cancelamento: "Avisar com 2h de antecedência",
  desconto: "Não, nunca",
  confirmacao: "Sim, manda",
  sistemas: "Kommo",
  aviso: "WhatsApp",
  nunca: "Nunca prometer aprovação de financiamento",
  vendedores: "Sim, dispensa",
  extra: ["Quando pedirem pra negociar comissão, passa pro gerente", "Quando for permuta, anota e passa pro corretor sênior", "Não, é isso"],
};

describe("onboarding em conversa", () => {
  it("imobiliária completa: roteiro dinâmico, nunca repete e gera fluxo de 100+ etapas válido", () => {
    const { e, perguntas } = conversar(IMOBILIARIA);
    expect(e.concluido).toBe(true);
    const repetidas = perguntas.filter((x, i) => x !== "extra" && perguntas.indexOf(x) !== i);
    expect(repetidas).toEqual([]);
    expect(perguntas).toContain("imob_alto_padrao");
    expect(perguntas).not.toContain("cli_convenios");
    expect(e.perfil.campos.alto_valor).toBe("2000000");
    expect(e.perfil.campos.transferir_numero).toBe("1932321000");
    expect(e.perfil.regras).toHaveLength(2);
    const { workflow, secoes } = gerarFluxo(e.perfil);
    expect(workflowSchema.safeParse(workflow).success).toBe(true);
    expect(validarWorkflow(workflow)).toEqual([]);
    expect(workflow.nos.length).toBeGreaterThanOrEqual(100);
    expect(workflow.arestas.length).toBeGreaterThanOrEqual(200);
    expect(secoes.map((s) => s.titulo)).toEqual(expect.arrayContaining(["Entrada", "Compra", "Locação", "Alto padrão", "Visitas", "Inquilinos", "Fechamento"]));
    expect(e.mensagens.at(-1)!.texto).toMatch(/etapas/);
  });

  it("nenhum card fica em cima de outro", () => {
    const { workflow } = gerarFluxo(conversar(IMOBILIARIA).e.perfil);
    const ns = workflow.nos;
    for (let i = 0; i < ns.length; i++)
      for (let j = i + 1; j < ns.length; j++) {
        const [a, b] = [ns[i], ns[j]];
        const sobrepoe = Math.abs(a.x - b.x) < 200 && Math.abs(a.y - b.y) < 56;
        expect(sobrepoe, `${a.id} x ${b.id}`).toBe(false);
      }
  });

  it("o mesmo perfil sempre gera o mesmo fluxo; negócios diferentes geram fluxos diferentes", () => {
    const a = gerarFluxo(conversar(IMOBILIARIA).e.perfil);
    const b = gerarFluxo(conversar(IMOBILIARIA).e.perfil);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = gerarFluxo(conversar({ ...IMOBILIARIA, imob_operacao: "Só venda", imob_alto_padrao: "Trata igual" }).e.perfil);
    expect(c.secoes.map((s) => s.id)).not.toContain("locacao");
    expect(c.secoes.map((s) => s.id)).not.toContain("alto_padrao");
  });

  it("aproveita informação dada de passagem e não pergunta de novo", () => {
    let e = iniciar();
    e = responder(e, "Tenho uma clínica odontológica");
    expect(e.perfil.campos.categoria).toBe("clinica");
    e = responder(e, "Sorriso Feliz, em Santos", { campos: { empresa_nome: "Sorriso Feliz", cidade: "Santos", horario: "seg a sex 8h às 18h" } });
    const { perguntas } = (() => {
      const ps: string[] = [];
      let x = e;
      while (!x.concluido) {
        ps.push(x.perguntaAtual!);
        x = pularPergunta(x);
      }
      return { perguntas: ps };
    })();
    expect(perguntas).not.toContain("horario");
    expect(perguntas).toContain("cli_convenios");
  });

  it("dúvida do dono: explica e repete a pergunta sem avançar", () => {
    let e = responder(iniciar(), "Restaurante japonês");
    const atual = e.perguntaAtual;
    e = responder(e, "como assim?");
    expect(e.perguntaAtual).toBe(atual);
    expect(e.mensagens.at(-1)!.texto.length).toBeGreaterThan(40);
  });

  it("dono apressado finaliza e ainda recebe um fluxo válido", () => {
    let e = responder(iniciar(), "Oficina mecânica");
    e = finalizar(e);
    expect(e.concluido).toBe(true);
    const { workflow } = gerarFluxo(e.perfil);
    expect(validarWorkflow(workflow)).toEqual([]);
  });

  it.each([
    ["clinica", { negocio: "Clínica de estética", empresa: "Bella, Curitiba", servicos: "Limpeza de pele - R$ 180; Botox - R$ 1.200", cli_especialidades: "Dermatologia; Estética facial", cli_convenios: "Só particular" }],
    ["restaurante", { negocio: "Pizzaria", empresa: "Forno di Nonna em BH", rest_reserva: "Até 12 pessoas, 15 min", rest_delivery: "Pelo iFood e WhatsApp", rest_eventos: "Passa pro gerente" }],
    ["servicos", { negocio: "Pet shop com banho e tosa", empresa: "Patas, Recife", srv_orcamento: "Dá por telefone", srv_urgencia: "Pet passando mal: transfere pro veterinário" }],
  ])("%s: roteiro próprio e fluxo válido", (cat, respostas) => {
    const { e, perguntas } = conversar(respostas);
    expect(e.perfil.campos.categoria).toBe(cat);
    expect(perguntas.some((q) => PERGUNTAS.find((x) => x.id === q)?.categoria === cat)).toBe(true);
    const { workflow } = gerarFluxo(e.perfil);
    expect(validarWorkflow(workflow)).toEqual([]);
    expect(workflow.nos.length).toBeGreaterThan(40);
  });

  it("cada resposta faz o fluxo crescer", () => {
    let e = iniciar();
    const tamanhos = [gerarFluxo(e.perfil).workflow.nos.length];
    for (const r of ["Imobiliária", "Lar, Campinas", "Apartamentos", "visita; boleto", "seg a sex 9 às 18", "sim", "anota e me passa"]) {
      e = responder(e, r);
      tamanhos.push(gerarFluxo(e.perfil).workflow.nos.length);
    }
    expect(tamanhos.at(-1)!).toBeGreaterThan(tamanhos[0] * 4);
    expect(e.mensagens.some((m) => m.mudancas && m.mudancas.nos > 0)).toBe(true);
  });

  it("extração local", () => {
    expect(valorEmReais("acima de 1,5 mi")).toBe(1_500_000);
    expect(valorEmReais("2 milhões")).toBe(2_000_000);
    expect(valorEmReais("R$ 800 mil")).toBe(800_000);
    expect(categoriaDe("consultório de psicologia")).toBe("clinica");
    expect(categoriaDe("hamburgueria artesanal")).toBe("restaurante");
    const h = lerHorario("seg a sex 8h às 18h, sábado 8 às 12");
    expect(h[1]).toEqual({ aberto: true, inicio: "08:00", fim: "18:00" });
    expect(h[6]).toEqual({ aberto: true, inicio: "08:00", fim: "12:00" });
    expect(h[0].aberto).toBe(false);
    expect(roteiro({ campos: {}, regras: [], pulados: [] }).every((q) => q.camada === "base")).toBe(true);
  });
});
