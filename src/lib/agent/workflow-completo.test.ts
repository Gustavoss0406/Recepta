import { describe, expect, it } from "vitest";
import { getNicho } from "@/lib/niches";
import { NICHOS } from "./config";
import { iniciarFluxo, seguir, saidas, validarWorkflow, workflowSchema } from "./workflow";
import { workflowCompleto } from "./workflow-completo";

describe("Fluxo completo de atendimento", () => {
  it("é válido em todos os nichos e combinações", () => {
    for (const nicho of NICHOS) {
      const base = getNicho(nicho).padrao({ nome: "Empresa", cidade: "Campinas" });
      const variantes = [
        base,
        { ...base, acoes: { ...base.acoes, agendar: { ...base.acoes.agendar, ativo: false }, transferir: { ...base.acoes.transferir, ativo: false } } },
        {
          ...base,
          acoes: {
            ...base.acoes,
            transferir: { ...base.acoes.transferir, ativo: true, numero: "+55 19 3333-4444" },
            apis: [{ id: "abc12345", nome: "consultar_pedido", descricao: "Consulta o status de um pedido.", nivel: "consultar" as const, metodo: "GET" as const, url: "https://x.com/{n}", parametros: [], campos: [], cabecalhos: {}, temCredencial: false }],
          },
        },
      ];
      for (const c of variantes) {
        const wf = workflowCompleto(c);
        expect(workflowSchema.safeParse(wf).success).toBe(true);
        expect(validarWorkflow(wf)).toEqual([]);
        expect(iniciarFluxo(wf).atual).toBe("recepcao");
      }
    }
  });

  it("falar com alguém: transfere dentro do horário, fora passa o caso para a equipe", () => {
    const base = getNicho("clinica").padrao({ nome: "Clínica" });
    const wf = workflowCompleto({ ...base, acoes: { ...base.acoes, transferir: { ...base.acoes.transferir, ativo: true, numero: "+5519333344444" } } });
    const paraPessoa = saidas(wf, "recepcao").find((a) => a.para === "decide_pessoa")!;
    expect(seguir(wf, "recepcao", paraPessoa.id, { dentro_do_horario: "sim" })?.efeitos).toEqual([{ tipo: "transferir", numero: "" }]);
    expect(seguir(wf, "recepcao", paraPessoa.id, { dentro_do_horario: "nao" })?.atual).toBe("recado");
  });

  it("todo assunto volta para 'Mais alguma coisa?' e de lá para um novo assunto", () => {
    const wf = workflowCompleto(getNicho("imobiliaria").padrao({ nome: "Imobiliária" }));
    for (const t of ["duvidas", "agendar", "meus", "reclamacao"]) expect(saidas(wf, t).some((a) => a.para === "fechamento")).toBe(true);
    expect(saidas(wf, "fechamento").map((a) => a.para).sort()).toEqual(["fim", "recepcao"]);
  });
});
