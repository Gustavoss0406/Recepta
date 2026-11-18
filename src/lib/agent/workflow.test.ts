import { describe, expect, it } from "vitest";
import { contextoEtapa, iniciarFluxo, percorrer, retomarAposAcao, seguir, validarWorkflow, workflowPadrao, type Workflow } from "./workflow";

const wf = (): Workflow => ({ ...workflowPadrao(), ativo: true });

describe("Workflow", () => {
  it("padrão é válido e começa na Recepção", () => {
    expect(validarWorkflow(wf())).toEqual([]);
    expect(iniciarFluxo(wf())).toEqual({ atual: "triagem", efeitos: [] });
    expect(contextoEtapa(wf(), "triagem")).toContain("a2: O cliente quer marcar");
  });

  it("seguir caminho, ação aguarda ferramenta e retoma por sucesso/falha", () => {
    expect(seguir(wf(), "triagem", "a2")?.atual).toBe("agenda");
    expect(seguir(wf(), "triagem", "inexistente")).toBeNull();
    const r = seguir(wf(), "triagem", "a3")!;
    expect(r).toEqual({ atual: "repasse", efeitos: [{ tipo: "acao", ferramenta: "repassar_para_equipe", noId: "repasse" }] });
    expect(retomarAposAcao(wf(), "repasse", true)).toEqual({ atual: null, efeitos: [{ tipo: "fim" }] });
  });

  it("nós automáticos: falar e atualizar estado encadeados até transferir", () => {
    const w: Workflow = {
      ativo: true,
      nos: [
        { id: "i", tipo: "inicio", x: 0, y: 0, titulo: "", texto: "" },
        { id: "f", tipo: "falar", x: 0, y: 0, titulo: "", texto: "Um momento." },
        { id: "e", tipo: "atualizar_estado", x: 0, y: 0, titulo: "", texto: "prioridade=alta" },
        { id: "t", tipo: "transferir", x: 0, y: 0, titulo: "", texto: "+5511999990000" },
      ],
      arestas: [
        { id: "1", de: "i", para: "f", condicao: "" },
        { id: "2", de: "f", para: "e", condicao: "" },
        { id: "3", de: "e", para: "t", condicao: "" },
      ],
    };
    expect(iniciarFluxo(w)).toEqual({
      atual: null,
      efeitos: [
        { tipo: "falar", texto: "Um momento." },
        { tipo: "estado", chave: "prioridade", valor: "alta" },
        { tipo: "transferir", numero: "+5511999990000" },
      ],
    });
  });

  it("validação aponta problemas e um ciclo automático não trava", () => {
    const w = wf();
    w.arestas = w.arestas.filter((a) => a.id !== "a4");
    w.nos.find((n) => n.id === "triagem")!.texto = "";
    const erros = validarWorkflow(w);
    expect(erros.some((e) => e.includes("Agendamento") && e.includes("saída"))).toBe(true);
    expect(erros.some((e) => e.includes("objetivo"))).toBe(true);
    const ciclo: Workflow = {
      ativo: true,
      nos: [
        { id: "a", tipo: "falar", x: 0, y: 0, titulo: "", texto: "x" },
        { id: "b", tipo: "falar", x: 0, y: 0, titulo: "", texto: "y" },
      ],
      arestas: [
        { id: "1", de: "a", para: "b", condicao: "" },
        { id: "2", de: "b", para: "a", condicao: "" },
      ],
    };
    expect(percorrer(ciclo, "a", {}, 5).efeitos).toHaveLength(5);
  });
});
