import "server-only";
import { z } from "zod";
import type { AgentConfig } from "@/lib/agent/config";
import { getLlm } from "@/server/providers/llm";
import type { ResultadoSite } from "./conhecimento";

export interface PerfilEmpresa {
  endereco: string;
  telefone: string;
  servicos: { nome: string; preco?: string; duracaoMin?: number }[];
  formasPagamento: string[];
  convenios: string[];
  observacoes: string;
  fonte: "ia" | "heuristica";
}

const schemaPerfil = z.object({
  endereco: z.string().describe("Endereço completo, ou vazio"),
  telefone: z.string().describe("Telefone principal, ou vazio"),
  servicos: z.array(z.object({ nome: z.string(), preco: z.string().describe("Preço como aparece no site, ou vazio") })).describe("Até 15 serviços ou produtos principais"),
  formasPagamento: z.array(z.string()),
  convenios: z.array(z.string()).describe("Convênios ou planos aceitos, se houver"),
  horario: z.string().describe("Horário de funcionamento como aparece no site, ou vazio"),
  observacoes: z.string().describe("Informações úteis para atendimento por telefone que não couberam acima (máx. 3 frases)"),
});

/** Turns crawled pages into an editable company profile ("O que aprendemos"). */
export async function extrairPerfilEmpresa(r: ResultadoSite): Promise<PerfilEmpresa> {
  const llm = await getLlm();
  if (llm.real) {
    try {
      const { dados } = await llm.estruturado({
        modelo: "claude-haiku-5-5",
        system: "Você extrai informações de atendimento do site de uma empresa brasileira. Não invente: deixe vazio o que não estiver no texto.",
        prompt: `Título: ${r.titulo}\nDescrição: ${r.descricao}\n\nTexto do site:\n${r.textoPrincipal}`,
        schema: schemaPerfil,
        maxTokens: 2048,
      });
      return {
        endereco: dados.endereco,
        telefone: dados.telefone,
        servicos: dados.servicos.filter((s) => s.nome).map((s) => ({ nome: s.nome, ...(s.preco ? { preco: s.preco } : {}) })),
        formasPagamento: dados.formasPagamento,
        convenios: dados.convenios,
        observacoes: [dados.horario && `Horário informado no site: ${dados.horario}`, dados.observacoes].filter(Boolean).join(" "),
        fonte: "ia",
      };
    } catch {
      /* fall through to heuristics */
    }
  }
  const f = r.fatos;
  return {
    endereco: f.enderecos[0] ?? "",
    telefone: f.telefones[0] ?? "",
    servicos: f.precos.slice(0, 10).map((l) => {
      const [nome, resto] = l.split(/R\$/);
      return { nome: nome.replace(/[-–:|]+\s*$/, "").trim() || l, ...(resto ? { preco: `R$${resto.trim().split(/\s/)[0]}` } : {}) };
    }),
    formasPagamento: f.pagamentos,
    convenios: [],
    observacoes: [r.descricao, f.horarios.length ? `Horário informado no site: ${f.horarios.join("; ")}` : ""].filter(Boolean).join(" "),
    fonte: "heuristica",
  };
}

export function aplicarPerfilExtraido(atual: AgentConfig["empresa"], p: PerfilEmpresa): AgentConfig["empresa"] {
  return {
    ...atual,
    endereco: p.endereco || atual.endereco,
    telefone: p.telefone || atual.telefone,
    servicos: p.servicos.length ? p.servicos : atual.servicos,
    formasPagamento: p.formasPagamento.length ? p.formasPagamento : atual.formasPagamento,
    convenios: p.convenios.length ? p.convenios : atual.convenios,
    observacoes: p.observacoes || atual.observacoes,
  };
}
