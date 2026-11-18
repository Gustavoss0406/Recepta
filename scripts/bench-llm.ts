/** Live benchmark of every free-rotation candidate on real receptionist turns (PT-BR + tools). */
import type Anthropic from "@anthropic-ai/sdk";
import { NICHOS_DEF } from "@/lib/niches";
import { compilarPrompt } from "@/lib/agent/prompt";
import { definirFerramentas } from "@/server/agent/ferramentas";
import { provedoresPadrao } from "@/server/providers/llm-rotacao";
import { turnoOpenAI } from "@/server/providers/llm-openai";

const config = NICHOS_DEF.clinica.padrao({ nome: "Clínica Sorriso", cidade: "Campinas" });
const system = compilarPrompt(config);
const tools = definirFerramentas(config);
const ctx = "Contexto da ligação: hoje é terça-feira, 18 de novembro, 10h (horário de Brasília). Você já disse a saudação.";
const casos: { nome: string; fala: string; conhecimento?: string; espera: (r: Anthropic.ContentBlock[]) => boolean }[] = [
  {
    nome: "informação",
    fala: "Vocês aceitam Unimed?",
    conhecimento: "Conhecimento (trechos do site e documentos da empresa):\n- Aceitamos os convênios Unimed e Bradesco Saúde.",
    espera: (r) => r.some((b) => b.type === "text" && /unimed/i.test(b.text)) && !r.some((b) => b.type === "tool_use"),
  },
  { nome: "agenda", fala: "Queria marcar uma limpeza para amanhã de manhã.", espera: (r) => r.some((b) => b.type === "tool_use" && b.name === "consultar_horarios") },
  {
    nome: "repasse",
    fala: "Se eu fechar o tratamento completo vocês me dão 30% de desconto? Meu nome é João, 19 99999-1234.",
    espera: (r) => r.some((b) => b.type === "tool_use" && b.name === "repassar_para_equipe"),
  },
];

for (const p of provedoresPadrao()) {
  let modelos: string[] = [];
  try {
    modelos = await p.modelos();
  } catch (e) {
    console.log(p.id, "sem lista de modelos:", e instanceof Error ? e.message : e);
  }
  for (const m of modelos) {
    const linha: string[] = [];
    for (const c of casos) {
      const t0 = Date.now();
      try {
        const r = await turnoOpenAI(
          { nome: `${p.id}/${m}`, baseURL: p.baseURL, modelo: m, chave: p.chave, timeoutMs: 20000, extraHeaders: p.extraHeaders },
          { modelo: "gratuito", system, tools, maxTokens: 600, messages: [{ role: "user", content: [{ type: "text", text: ctx }, ...(c.conhecimento ? [{ type: "text" as const, text: c.conhecimento }] : []), { type: "text", text: `Cliente: ${c.fala}` }] }] },
        );
        const ok = c.espera(r.content);
        const fala = r.content.find((b) => b.type === "text") as Anthropic.TextBlock | undefined;
        linha.push(`${c.nome}:${ok ? "✓" : "✗"} ${Date.now() - t0}ms${fala ? ` “${fala.text.slice(0, 60)}”` : ""}${r.content.filter((b) => b.type === "tool_use").map((b) => ` [${(b as Anthropic.ToolUseBlock).name}]`).join("")}`);
      } catch (e) {
        linha.push(`${c.nome}:ERRO ${Date.now() - t0}ms ${(e instanceof Error ? e.message : String(e)).slice(0, 90)}`);
      }
    }
    console.log(`\n## ${p.id}/${m}\n  ${linha.join("\n  ")}`);
  }
}
