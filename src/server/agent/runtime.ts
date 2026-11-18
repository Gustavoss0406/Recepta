import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq, max } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { Canal, UsoConversa } from "@/db/schema";
import { contextoTemporal } from "@/lib/agent/agenda";
import { mascarar } from "@/lib/agent/mask";
import { billableMinutes, costCall } from "@/lib/pricing/ledger";
import type { LlmModel } from "@/lib/pricing/rates";
import { getLlm, textoDe } from "@/server/providers/llm";
import { admitirChamada, deveAtenderSoRecado, liberarChamada, verificarAlertas } from "@/server/billing/limites";
import { emitirEvento } from "@/server/integracoes/eventos";
import { configParaConversa } from "./agentes";
import { buscarConhecimento } from "./conhecimento";
import { definirFerramentas, executarFerramenta } from "./ferramentas";
import { analisarConversa } from "./pos-chamada";
import { contextoEtapa, iniciarFluxo, no as noDoFluxo, retomarAposAcao, saidas, seguir, type Efeito } from "@/lib/agent/workflow";
import { criarRepasse } from "./repasses";
import { agendarSincronizacao, enviarSaida } from "@/server/integracoes/servico";
import { ErroSemMotor } from "@/server/providers/llm-rotacao";
import { versaoParaNovaChamada } from "./experimentos";

const CANAIS_TESTE: Canal[] = ["teste_texto", "teste_voz", "simulador", "simulacao"];
const MAX_ITERACOES = 5;

export class ErroLinhaOcupada extends Error {
  constructor(public motivo: "concorrencia" | "suspensa") {
    super(motivo === "concorrencia" ? "Todas as linhas estão ocupadas" : "Conta suspensa");
  }
}

export interface AcaoExecutada {
  nome: string;
  args: Record<string, unknown>;
  resultado: Record<string, unknown>;
}

export interface RespostaAgente {
  /** In speaking order: text said before a tool call ("deixa eu ver…") and the final answer. */
  falas: string[];
  acoes: AcaoExecutada[];
  encerrar: boolean;
  transferirPara?: string;
  modoDemo: boolean;
}

const usoVazio = (modelo: string): UsoConversa => ({
  llmModelo: modelo,
  llmInput: 0,
  llmCached: 0,
  llmOutput: 0,
  posInput: 0,
  posOutput: 0,
  ttsChars: 0,
  ttsTier: "padrao",
  sttSegundos: 0,
  telefoniaSegundos: 0,
});

export async function iniciarConversa(opts: {
  orgId: string;
  agenteId: string;
  canal: Canal;
  de?: string;
  mockAgenda?: "com_horarios" | "sem_horarios";
  alvo?: "publicado" | "rascunho";
}) {
  const teste = CANAIS_TESTE.includes(opts.canal);
  const alvo = opts.alvo ?? (teste ? "rascunho" : "publicado");
  const { config, versaoId } = await configParaConversa(
    opts.orgId,
    opts.agenteId,
    alvo === "publicado" ? { versaoId: await versaoParaNovaChamada(opts.orgId, opts.agenteId) } : "rascunho",
  );
  const llm = await getLlm();
  const modelo: LlmModel = llm.gratuito ? "gratuito" : config.modelo === "avancado" ? "claude-sonnet-5-5" : "claude-haiku-5-5";
  const db = getDb();

  const modoRecado = !teste && (await deveAtenderSoRecado(opts.orgId));
  const [conv] = await db
    .insert(schema.conversas)
    .values({
      orgId: opts.orgId,
      agenteId: opts.agenteId,
      versaoId,
      canal: opts.canal,
      teste,
      de: opts.de ?? null,
      modoRecado,
      estado: { mensagens: [], mockAgenda: opts.mockAgenda, modelo },
      uso: { ...usoVazio(modelo), ttsTier: config.voz.ultra ? "ultra" : "padrao" },
    })
    .returning();

  if (!teste) {
    const adm = await admitirChamada(opts.orgId, conv.id);
    if (!adm.admitida) {
      await db.delete(schema.conversas).where(eq(schema.conversas.id, conv.id));
      throw new ErroLinhaOcupada(adm.motivo ?? "concorrencia");
    }
    if (adm.pico) await db.update(schema.conversas).set({ pico: true }).where(eq(schema.conversas.id, conv.id));
  }

  const saudacao = modoRecado
    ? `${config.empresa.nome}, olá! Aqui é ${config.comportamento.nomeAgente}, recepcionista virtual. A ligação é gravada. No momento a equipe vai te retornar: pode me dizer seu nome e o que precisa?`
    : config.comportamento.saudacao;
  await db.insert(schema.turnos).values({ orgId: opts.orgId, conversaId: conv.id, ordem: 0, papel: "agente", texto: saudacao });
  return { conversaId: conv.id, saudacao, modoDemo: !llm.real, modoRecado, teste, versaoId };
}

async function carregar(conversaId: string) {
  const [c] = await getDb().select().from(schema.conversas).where(eq(schema.conversas.id, conversaId)).limit(1);
  if (!c) throw new Error("Conversa não encontrada");
  return c;
}

async function proximaOrdem(conversaId: string) {
  const [{ m }] = await getDb().select({ m: max(schema.turnos.ordem) }).from(schema.turnos).where(eq(schema.turnos.conversaId, conversaId));
  return (m ?? -1) + 1;
}

/** One customer utterance → agent reply, running tools in between. */
export async function responder(conversaId: string, textoCliente: string, opts: { offsetMs?: number; agora?: Date } = {}): Promise<RespostaAgente> {
  const db = getDb();
  const conv = await carregar(conversaId);
  if (conv.status !== "em_andamento") throw new Error("Esta conversa já foi encerrada.");
  const [org] = await db.select().from(schema.organizacoes).where(eq(schema.organizacoes.id, conv.orgId));
  const { config, prompt } = await configParaConversa(conv.orgId, conv.agenteId, conv.versaoId ? { versaoId: conv.versaoId } : "rascunho");
  const llm = await getLlm();
  const agora = opts.agora ?? new Date();
  const estado = conv.estado ?? { mensagens: [] };
  const mensagens = estado.mensagens as Anthropic.MessageParam[];
  const modelo = (estado.modelo ?? "claude-haiku-5-5") as LlmModel;
  const uso = conv.uso ?? usoVazio(modelo);

  const fala = org.mascararDados ? mascarar(textoCliente) : textoCliente;
  let ordem = await proximaOrdem(conversaId);
  await db.insert(schema.turnos).values({ orgId: conv.orgId, conversaId, ordem: ordem++, papel: "cliente", texto: fala, offsetMs: opts.offsetMs ?? 0 });

  const blocos: Anthropic.TextBlockParam[] = [];
  if (mensagens.length === 0) {
    const saud = await db
      .select({ texto: schema.turnos.texto })
      .from(schema.turnos)
      .where(and(eq(schema.turnos.conversaId, conversaId), eq(schema.turnos.ordem, 0)));
    blocos.push({
      type: "text",
      text: `Contexto da ligação: ${contextoTemporal(config.horarios, agora)} ${conv.de ? `Telefone do cliente: ${conv.de}.` : ""} ${
        conv.modoRecado ? "MODO RECADO: apenas colete nome, telefone e o pedido, use repassar_para_equipe e encerre com educação." : ""
      }\nVocê já disse a saudação: "${saud[0]?.texto ?? config.comportamento.saudacao}"`,
    });
  }
  // Workflow: the current step's goal and exits are given to the model on every turn.
  const wf = config.workflow;
  const fluxo = wf?.ativo ? wf : null;
  const falasFluxo: string[] = [];
  if (fluxo && estado.no === undefined) {
    const ini = iniciarFluxo(fluxo);
    estado.no = ini.atual;
    for (const e of ini.efeitos) if (e.tipo === "falar") falasFluxo.push(e.texto);
  }
  const etapa = fluxo && estado.no ? contextoEtapa(fluxo, estado.no) : null;
  if (etapa) blocos.push({ type: "text", text: etapa });
  const trechos = await buscarConhecimento(conv.agenteId, fala, 3);
  if (trechos.length) blocos.push({ type: "text", text: `Conhecimento (trechos do site e documentos da empresa):\n${trechos.map((t) => `- ${t.texto.replace(/\n+/g, " ")}`).join("\n")}` });
  blocos.push({ type: "text", text: `Cliente: ${fala}` });
  mensagens.push({ role: "user", content: blocos });

  const tools = definirFerramentas(config);
  if (fluxo && estado.no && noDoFluxo(fluxo, estado.no)?.tipo === "subagente" && saidas(fluxo, estado.no).length)
    tools.push({
      name: "seguir_fluxo",
      description: "Avança o atendimento para a próxima etapa quando a condição de um caminho acontecer.",
      input_schema: { type: "object", properties: { caminho: { type: "string", enum: saidas(fluxo, estado.no).map((a) => a.id) } }, required: ["caminho"] },
    });
  const falas: string[] = [...falasFluxo];
  const acoes: AcaoExecutada[] = [];
  let encerrar = false;
  let transferirPara: string | undefined;

  /** Applies automatic workflow steps and tells the model what to do next. */
  function aplicarEfeitos(passo: { atual: string | null; efeitos: Efeito[] }) {
    estado.no = passo.atual;
    const ditas: string[] = [];
    let proximo = "";
    for (const e of passo.efeitos) {
      if (e.tipo === "falar") {
        falas.push(e.texto);
        ditas.push(e.texto);
      } else if (e.tipo === "estado") estado.vars = { ...(estado.vars ?? {}), [e.chave]: e.valor };
      else if (e.tipo === "acao") proximo = `Agora use a ferramenta ${e.ferramenta}.`;
      else if (e.tipo === "transferir") {
        transferirPara = e.numero || config.acoes.transferir.numero || undefined;
        encerrar = true;
        proximo = "Avise o cliente em uma frase que vai transferir a ligação.";
      } else if (e.tipo === "fim") {
        encerrar = true;
        proximo = "Despeça-se do cliente em uma frase.";
      }
    }
    const n = passo.atual ? noDoFluxo(fluxo!, passo.atual) : undefined;
    return {
      ok: true,
      etapa: n?.titulo ?? null,
      objetivo: n?.tipo === "subagente" ? n.texto : undefined,
      ja_dito_ao_cliente: ditas.length ? ditas : undefined,
      proximo: proximo || (n?.tipo === "subagente" ? "Continue a conversa seguindo o objetivo da nova etapa." : undefined),
    };
  }

  for (let i = 0; i < MAX_ITERACOES; i++) {
    let r;
    try {
      r = await llm.turno({ modelo, system: prompt, messages: mensagens, tools, maxTokens: 600 });
    } catch (e) {
      if (!(e instanceof ErroSemMotor)) throw e;
      // Every engine is rate-limited or down: never leave the caller in silence.
      falas.push("Desculpe, estou com uma instabilidade aqui agora. Já passei o seu pedido para a equipe, e alguém vai te retornar em breve. Obrigada pela ligação!");
      if (!conv.teste)
        await criarRepasse({
          orgId: conv.orgId,
          agenteId: conv.agenteId,
          conversaId,
          motivo: "A recepcionista ficou sem motor de resposta disponível durante a ligação",
          pedido: fala,
          urgencia: "media",
          proximoPasso: "Retornar a ligação e entender o pedido",
          contatoTelefone: conv.de,
          origem: "automatico",
          notificar: config.acoes.repassar?.notificar ?? "ambos",
        });
      encerrar = true;
      break;
    }
    uso.llmInput += r.uso.input;
    uso.llmCached += r.uso.cached;
    uso.llmOutput += r.uso.output;
    mensagens.push({ role: "assistant", content: r.content as Anthropic.ContentBlockParam[] });
    const t = textoDe(r.content);
    if (t) falas.push(t);
    const usos = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!usos.length) break;

    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const u of usos) {
      const args = (u.input ?? {}) as Record<string, unknown>;
      if (u.name === "seguir_fluxo" && fluxo && estado.no) {
        const passo = seguir(fluxo, estado.no, String(args.caminho ?? ""));
        const res = passo ? aplicarEfeitos(passo) : { ok: false, erro: "caminho_invalido" };
        acoes.push({ nome: u.name, args, resultado: res });
        await db.insert(schema.chamadasFerramenta).values({ orgId: conv.orgId, conversaId, nome: u.name, args, resultado: res });
        resultados.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(res) });
        continue;
      }
      const ef = await executarFerramenta(u.name, args, {
        orgId: conv.orgId,
        agenteId: conv.agenteId,
        conversaId,
        config,
        teste: conv.teste,
        mockAgenda: estado.mockAgenda as "com_horarios" | "sem_horarios" | undefined,
        agora,
        de: conv.de,
      });
      acoes.push({ nome: u.name, args, resultado: ef.resultado });
      await db.insert(schema.chamadasFerramenta).values({ orgId: conv.orgId, conversaId, nome: u.name, args, resultado: ef.resultado });
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(ef.resultado) });
      if (ef.encerrar) encerrar = true;
      if (ef.transferirPara) transferirPara = ef.transferirPara;
      // An action node waits for its tool: then follow its "sucesso" / "falha" exit.
      const atual = fluxo && estado.no ? noDoFluxo(fluxo, estado.no) : undefined;
      if (fluxo && atual?.tipo === "acao" && atual.texto.trim() === u.name) {
        const ok = (ef.resultado as { ok?: boolean }).ok !== false;
        const res = aplicarEfeitos(retomarAposAcao(fluxo, atual.id, ok));
        resultados[resultados.length - 1] = { type: "tool_result", tool_use_id: u.id, content: JSON.stringify({ ...ef.resultado, fluxo: res }) };
      }
    }
    mensagens.push({ role: "user", content: resultados });
    if (encerrar && u_soEncerrar(usos)) break;
    if (encerrar && transferirPara && !usos.some((x) => x.name === "seguir_fluxo")) break;
  }

  const textoAgente = falas.join(" ").trim();
  if (textoAgente) {
    uso.ttsChars += textoAgente.length;
    await db.insert(schema.turnos).values({ orgId: conv.orgId, conversaId, ordem: ordem++, papel: "agente", texto: textoAgente });
  }
  await db
    .update(schema.conversas)
    .set({ estado: { ...estado, mensagens, transferirPara: transferirPara ?? estado.transferirPara }, uso })
    .where(eq(schema.conversas.id, conversaId));
  return { falas, acoes, encerrar, transferirPara, modoDemo: !llm.real };
}

/** If the only tool in the last step was hang-up, there is nothing left to say. */
function u_soEncerrar(usos: Anthropic.ToolUseBlock[]) {
  return usos.every((u) => u.name === "encerrar_ligacao" || u.name === "transferir_para_humano");
}

/** Adds metered voice usage (STT seconds, telephony seconds) reported by the voice gateway. */
export async function registrarUsoVoz(conversaId: string, delta: { sttSegundos?: number; telefoniaSegundos?: number }) {
  const conv = await carregar(conversaId);
  const uso = conv.uso ?? usoVazio("claude-haiku-5-5");
  uso.sttSegundos += delta.sttSegundos ?? 0;
  uso.telefoniaSegundos += delta.telefoniaSegundos ?? 0;
  await getDb().update(schema.conversas).set({ uso }).where(eq(schema.conversas.id, conversaId));
}

/** Hang-up: analysis, billing minutes, cost ledger, notifications, events. */
export async function encerrarConversa(conversaId: string, opts: { duracaoS?: number; agora?: Date } = {}) {
  const db = getDb();
  const conv = await carregar(conversaId);
  if (conv.status === "encerrada") return conv;
  const agora = opts.agora ?? new Date();
  const duracaoS = Math.max(1, Math.round(opts.duracaoS ?? (agora.getTime() - conv.iniciadaEm.getTime()) / 1000));
  const cobraMinutos = !["teste_texto", "simulacao"].includes(conv.canal);
  const minutosCobrados = cobraMinutos ? billableMinutes(duracaoS) : 0;

  const turnos = await db
    .select({ papel: schema.turnos.papel, texto: schema.turnos.texto })
    .from(schema.turnos)
    .where(eq(schema.turnos.conversaId, conversaId))
    .orderBy(asc(schema.turnos.ordem));
  const acoes = (
    await db.select({ nome: schema.chamadasFerramenta.nome }).from(schema.chamadasFerramenta).where(eq(schema.chamadasFerramenta.conversaId, conversaId))
  ).map((a) => a.nome);
  const { config } = await configParaConversa(conv.orgId, conv.agenteId, conv.versaoId ? { versaoId: conv.versaoId } : "rascunho");

  let analise;
  try {
    analise = await analisarConversa(config, turnos, acoes);
  } catch {
    analise = null;
  }
  const uso = conv.uso ?? usoVazio("claude-haiku-5-5");
  if (analise) {
    uso.posInput += analise.uso.input;
    uso.posOutput += analise.uso.output;
  }
  const custo = costCall({
    callId: conversaId,
    accountId: conv.orgId,
    durationSeconds: duracaoS,
    telephonySeconds: uso.telefoniaSegundos,
    sttSeconds: uso.sttSegundos,
    ttsChars: conv.canal === "teste_texto" || conv.canal === "simulacao" ? 0 : uso.ttsChars,
    ttsTier: uso.ttsTier,
    llmModel: uso.llmModelo as LlmModel,
    llmInputTokens: uso.llmInput,
    llmCachedTokens: uso.llmCached,
    llmOutputTokens: uso.llmOutput,
    postCallLlmInputTokens: uso.posInput,
    postCallLlmOutputTokens: uso.posOutput,
  });
  const resultado = conv.estado?.transferirPara ? "transferido" : (analise?.resultado ?? null);

  const [final] = await db
    .update(schema.conversas)
    .set({
      status: "encerrada",
      encerradaEm: agora,
      duracaoS,
      minutosCobrados,
      resultado,
      resumo: analise?.resumo ?? null,
      motivo: analise?.motivo ?? null,
      dados: analise?.dados ?? null,
      avaliacao: analise ? { sucesso: analise.sucesso, justificativa: analise.justificativa } : null,
      sentimento: analise?.sentimento ?? null,
      uso,
    })
    .where(eq(schema.conversas.id, conversaId))
    .returning();
  await db.insert(schema.registroCusto).values({
    orgId: conv.orgId,
    conversaId,
    tipo: conv.canal === "simulacao" ? "simulacao" : conv.teste ? "teste" : "chamada",
    detalhes: { ...custo.usd, minutos: minutosCobrados },
    custoUsd: custo.usd.total,
    custoBrl: custo.brl,
  });

  // Safety net: a call that did not end well and was not handed off still reaches the team as a pending case.
  const repassou = acoes.includes("repassar_para_equipe") || acoes.includes("anotar_recado");
  if (!conv.teste && analise && !analise.sucesso && !repassou && resultado !== "transferido" && turnos.some((t) => t.papel === "cliente"))
    await criarRepasse({
      orgId: conv.orgId,
      agenteId: conv.agenteId,
      conversaId,
      motivo: `A ligação não foi resolvida: ${analise.justificativa}`,
      pedido: analise.motivo || analise.resumo,
      urgencia: analise.sentimento === "negativo" ? "alta" : "media",
      proximoPasso: "Ouvir a ligação e retornar ao cliente",
      contatoTelefone: conv.de,
      dados: analise.dados,
      origem: "automatico",
      notificar: config.acoes.repassar?.notificar ?? "ambos",
    });

  if (!conv.teste) {
    await liberarChamada(conversaId);
    const [org] = await db.select().from(schema.organizacoes).where(eq(schema.organizacoes.id, conv.orgId));
    if (org.telefoneContato && analise && !repassou && analise.sucesso)
      await enviarSaida(conv.orgId, { canal: "whatsapp", destino: org.telefoneContato, corpo: `Nova ligação (${resultado ?? "—"}): ${analise.resumo}` });
    if (analise)
      await agendarSincronizacao(conv.orgId, {
        tipo: "ligacao.encerrada",
        titulo: `Ligação: ${analise.motivo || "atendimento"}`,
        texto: analise.resumo,
        contato: { nome: analise.dados?.nome ?? null, telefone: analise.dados?.telefone ?? conv.de },
        resultado,
        quando: conv.iniciadaEm.toISOString(),
        dados: analise.dados,
        link: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/painel/ligacoes/${conversaId}`,
      });
    await emitirEvento(conv.orgId, resultado === "transferido" ? "call.transferred" : "call.ended", {
      conversaId,
      agenteId: conv.agenteId,
      canal: conv.canal,
      de: conv.de,
      duracaoS,
      minutosCobrados,
      resultado,
      resumo: analise?.resumo,
      dados: analise?.dados,
      sentimento: analise?.sentimento,
    });
    await verificarAlertas(conv.orgId);
  }
  return final;
}
