import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { aplicarResumo, pontoDeCorte, transcricao } from "./compactar";

type Msg = Anthropic.MessageParam;
const cliente = (t: string): Msg => ({ role: "user", content: [{ type: "text", text: `Cliente: ${t}` }] });
const agente = (t: string): Msg => ({ role: "assistant", content: [{ type: "text", text: t }] });
const usaFerramenta = (n: string): Msg => ({ role: "assistant", content: [{ type: "tool_use", id: n, name: "consultar_horarios", input: { periodo: "manha" } }] });
const resultado = (n: string): Msg => ({ role: "user", content: [{ type: "tool_result", tool_use_id: n, content: '{"horarios":[{"rotulo":"quinta 9h"}]}' }] });

function conversa(turnos: number): Msg[] {
  const m: Msg[] = [{ role: "user", content: [{ type: "text", text: 'Contexto da ligação: quarta 10h.\nVocê já disse a saudação: "Clínica, olá!"' }, { type: "text", text: "Cliente: oi" }] }];
  m.push(agente("Oi! Como posso ajudar?"));
  for (let i = 0; i < turnos; i++) {
    m.push(cliente(`pergunta ${i}`), usaFerramenta(`t${i}`), resultado(`t${i}`), agente(`resposta ${i}`));
  }
  return m;
}

describe("Resumo de ligações longas", () => {
  it("não corta ligações curtas", () => {
    expect(pontoDeCorte(conversa(4))).toBeNull();
  });

  it("corta só no início de uma fala do cliente, mantendo pares de ferramenta juntos", () => {
    const m = conversa(8); // 2 + 32 messages
    const corte = pontoDeCorte(m)!;
    expect(corte).not.toBeNull();
    expect(m[corte].role).toBe("user");
    expect(JSON.stringify(m[corte].content)).toContain("Cliente:");
    expect(m.length - corte).toBeGreaterThanOrEqual(10);
  });

  it("a transcrição leva o que importa e descarta o contexto técnico", () => {
    const t = transcricao(conversa(1));
    expect(t).toContain("Cliente: pergunta 0");
    expect(t).toContain("Recepcionista: resposta 0");
    expect(t).toContain("(ação consultar_horarios");
    expect(t).toContain("Você já disse a saudação");
    expect(t).not.toContain("Contexto da ligação");
  });

  it("o histórico novo alterna papéis e começa pelo resumo", () => {
    const m = conversa(8);
    const corte = pontoDeCorte(m)!;
    const novo = aplicarResumo(m, corte, "Cliente Maria quer marcar limpeza; quinta 9h oferecida.");
    expect(novo.length).toBe(m.length - corte + 2);
    expect(novo.map((x) => x.role).slice(0, 3)).toEqual(["user", "assistant", "user"]);
    expect(JSON.stringify(novo[0].content)).toContain("Maria");
  });
});

describe("Conhecimento só na fala atual", () => {
  it("remove os trechos do site das falas anteriores e mantém na atual", async () => {
    const { semConhecimentoAntigo } = await import("@/server/agent/runtime");
    const k = (t: string) => ({ type: "text" as const, text: `Conhecimento (trechos do site e documentos da empresa):\n- ${t}` });
    const msgs: Msg[] = [
      { role: "user", content: [k("lista antiga de imóveis"), { type: "text", text: "Cliente: quero comprar" }] },
      agente("Me diz seu nome?"),
      { role: "user", content: [k("trecho novo"), { type: "text", text: "Cliente: tem casa no Fidélis?" }] },
    ];
    const r = JSON.stringify(semConhecimentoAntigo(msgs));
    expect(r).not.toContain("lista antiga");
    expect(r).toContain("trecho novo");
    expect(r).toContain("Cliente: quero comprar");
  });
});
