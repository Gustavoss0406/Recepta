import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { getLlm } from "@/server/providers/llm";
import { criarAgente, primeiroAgente, salvarRascunho } from "@/server/agent/agentes";
import { indexarSite } from "@/server/agent/conhecimento";
import { iniciar, type EstadoOnboarding, type Interpretacao } from "@/lib/onboarding/conversa";
import { configDoPerfil, nichoDoPerfil } from "@/lib/onboarding/config";
import { CAMPOS, type Perfil } from "@/lib/onboarding/perfil";
import { pergunta } from "@/lib/onboarding/perguntas";

export async function carregarOnboarding(orgId: string): Promise<EstadoOnboarding> {
  const [o] = await getDb().select({ c: schema.organizacoes.onboardingConversa }).from(schema.organizacoes).where(eq(schema.organizacoes.id, orgId));
  return o?.c ?? iniciar();
}

export async function salvarOnboarding(orgId: string, e: EstadoOnboarding) {
  await getDb().update(schema.organizacoes).set({ onboardingConversa: e }).where(eq(schema.organizacoes.id, orgId));
}

const interpretacaoSchema = z.object({
  campos: z.record(z.string(), z.string()).default({}),
  regra: z.object({ quando: z.string(), fazer: z.string() }).nullable().optional(),
  duvida: z.boolean().default(false),
  explicacao: z.string().default(""),
  reacao: z.string().default(""),
});

const SYSTEM = `Você é a Recepta, que conversa com o dono de uma empresa para configurar a recepcionista virtual dele.
Sua tarefa agora é só INTERPRETAR a resposta do dono e devolver JSON. Regras:
- "campos": preencha as chaves da pergunta atual e QUALQUER outra informação que ele tenha dado de passagem, usando só as chaves da lista. Normalize como a descrição pede. Não invente: se não foi dito, não inclua.
- "regra": só na pergunta de situações específicas: { "quando": situação, "fazer": o que fazer }.
- "duvida": true se o dono fez uma pergunta ou não entendeu (em vez de responder); então "explicacao" responde a dúvida em 1-2 frases informais com um exemplo.
- "reacao": UMA frase curta, informal e calorosa (até 14 palavras), reagindo ao conteúdo do que ele disse, em português do Brasil. Sem pergunta, sem emoji, sem repetir a resposta inteira. Varie (não comece sempre com "Show" ou "Perfeito").`;

/** Model interpretation of one answer; null when no engine is available (the local parser is used). */
export async function interpretar(p: Perfil, perguntaId: string, texto: string): Promise<Interpretacao | null> {
  const q = pergunta(perguntaId);
  if (!q) return null;
  try {
    const llm = await getLlm();
    if (!llm.real) return null;
    const chaves = Object.entries(CAMPOS).map(([k, d]) => `- ${k}: ${d}`).join("\n");
    const { dados } = await llm.estruturado({
      modelo: "claude-haiku-5-5",
      system: SYSTEM,
      prompt: `Chaves possíveis:\n${chaves}\n\nJá sabemos: ${JSON.stringify(p.campos)}\n\nPergunta atual (chaves: ${q.chaves.join(", ")}): "${q.texto(p)}"\nResposta do dono: "${texto.slice(0, 800)}"`,
      schema: interpretacaoSchema,
      maxTokens: 600,
      qualidade: "rapida",
    });
    return dados;
  } catch {
    return null;
  }
}

/** Creates (or updates) the receptionist from the conversation and moves the wizard to "Teste agora". */
export async function concluirOnboarding(orgId: string, e: EstadoOnboarding) {
  const f = e.perfil.campos;
  const nicho = nichoDoPerfil(e.perfil);
  const db = getDb();
  let agente = await primeiroAgente(orgId);
  if (!agente) agente = await criarAgente(orgId, nicho, { nome: f.empresa_nome || "Minha empresa", cidade: f.cidade });
  const config = configDoPerfil(agente.rascunho, e.perfil);
  await salvarRascunho(orgId, agente.id, config, `Recepção ${config.empresa.nome}`.slice(0, 80));
  await db
    .update(schema.organizacoes)
    .set({ nome: config.empresa.nome, nicho, cidade: f.cidade || null, onboardingPasso: 5, onboardingConversa: e })
    .where(eq(schema.organizacoes.id, orgId));
  // reading the site can take a while: it fills the knowledge base in the background
  if (f.site && !/^n(a|ã)o$/i.test(f.site)) void indexarSite(orgId, agente.id, f.site.startsWith("http") ? f.site : `https://${f.site}`).catch(() => {});
  return agente.id;
}
