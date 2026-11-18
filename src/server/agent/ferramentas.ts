import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte, lt } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { AgentConfig } from "@/lib/agent/config";
import { dentroDoHorario, gerarHorarios, rotuloHorario } from "@/lib/agent/agenda";
import { urlPublicaSegura } from "@/server/crawler/seguranca";
import { criarEventoGoogle, ocupadosGoogle } from "@/server/integracoes/google";
import { criarRepasse, type Urgencia } from "./repasses";
import { enviarSaida } from "@/server/integracoes/servico";

export interface CtxFerramenta {
  orgId: string;
  agenteId: string;
  conversaId: string;
  config: AgentConfig;
  teste: boolean;
  mockAgenda?: "com_horarios" | "sem_horarios";
  agora: Date;
  de?: string | null;
  /** For the hang-up guard: what the caller just said, the receptionist's previous line and whether something was already done. */
  ultimaFalaCliente?: string;
  ultimaFalaAgente?: string;
  concluiuAlgo?: boolean;
}

export interface EfeitoFerramenta {
  resultado: Record<string, unknown>;
  encerrar?: boolean;
  transferirPara?: string;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required });

export function definirFerramentas(c: AgentConfig): Anthropic.Tool[] {
  const t: Anthropic.Tool[] = [];
  if (c.acoes.colegas?.length)
    t.push({
      name: "passar_para_colega",
      description: `Passa a ligação para outra recepcionista da empresa, que continua o atendimento com todo o histórico. Antes, avise o cliente em uma frase. Use quando: ${c.acoes.colegas
        .map((x) => `${x.nome} (${x.agenteId}) → ${x.quando}`)
        .join("; ")}.`,
      input_schema: obj(
        {
          colega: { type: "string", enum: c.acoes.colegas.map((x) => x.agenteId), description: "Quem assume a ligação" },
          motivo: { type: "string", description: "Resumo em uma frase do que o cliente precisa" },
        },
        ["colega", "motivo"],
      ),
    });
  if (c.acoes.agendar.ativo) {
    t.push({
      name: "consultar_horarios",
      description: "Lista horários livres na agenda. Use antes de oferecer horários ao cliente.",
      input_schema: obj({
        data_preferida: { type: "string", description: "Data desejada no formato AAAA-MM-DD, se o cliente indicou" },
        periodo: { type: "string", enum: ["manha", "tarde", "noite"], description: "Período preferido, se indicado" },
      }),
    });
    t.push({
      name: "agendar",
      description: "Confirma um agendamento em um horário retornado por consultar_horarios.",
      input_schema: obj(
        {
          inicio: { type: "string", description: "Início em ISO 8601, exatamente como veio de consultar_horarios" },
          nome: { type: "string", description: "Nome do cliente" },
          telefone: { type: "string", description: "Telefone do cliente" },
          servico: { type: "string", description: "Serviço ou motivo" },
          observacao: { type: "string" },
        },
        ["inicio", "nome"],
      ),
    });
  }
  if (c.acoes.transferir.ativo)
    t.push({
      name: "transferir_para_humano",
      description: "Transfere a ligação para uma pessoa da equipe.",
      input_schema: obj({ motivo: { type: "string" } }, ["motivo"]),
    });
  t.push({
    name: "repassar_para_equipe",
    description:
      "Passa o caso para a equipe com um relatório, quando você não tem certeza de como resolver. A equipe recebe o relatório e retorna ao cliente.",
    input_schema: obj(
      {
        motivo: { type: "string", description: "Por que você está passando o caso (ex.: informação não disponível, pedido de desconto, cliente insatisfeito)" },
        o_que_o_cliente_quer: { type: "string", description: "O pedido do cliente em uma frase, nas palavras dele" },
        urgencia: { type: "string", enum: ["baixa", "media", "alta"], description: "alta: dor, risco, cliente muito insatisfeito ou prazo hoje" },
        nome: { type: "string", description: "Nome do cliente" },
        telefone: { type: "string", description: "Telefone para retorno" },
        proximo_passo: { type: "string", description: "O que a equipe deve fazer (ex.: ligar de volta hoje à tarde com o orçamento)" },
      },
      ["motivo", "o_que_o_cliente_quer", "urgencia"],
    ),
  });
  if (c.acoes.whatsapp.ativo)
    t.push({
      name: "enviar_whatsapp",
      description: "Envia uma mensagem de WhatsApp ao cliente (ex.: confirmação do agendamento). Só use com a autorização do cliente.",
      input_schema: obj({ telefone: { type: "string" }, mensagem: { type: "string" } }, ["telefone", "mensagem"]),
    });
  for (const w of c.acoes.webhooks)
    t.push({
      name: w.nome,
      description: w.descricao,
      input_schema: obj(
        Object.fromEntries(w.parametros.map((p) => [p.nome, { type: "string", description: p.descricao }])),
        w.parametros.filter((p) => p.obrigatorio).map((p) => p.nome),
      ),
    });
  t.push({
    name: "encerrar_ligacao",
    description: "Encerra a ligação. Só use depois que o cliente se despedir ou disser que não precisa de mais nada (pergunte antes: \"Posso ajudar em mais alguma coisa?\"), ou em trote/abuso.",
    input_schema: obj({ motivo: { type: "string", enum: ["cliente_se_despediu", "trote_ou_abuso"], description: "Por que encerrar" } }),
  });
  return t;
}

const DESPEDIDA = /\b(tchau|até (logo|mais|amanhã|breve)|obrigad[oa]|valeu|brigad[oa]|era (só )?isso|é só isso|só isso|falou|boa (noite|tarde)|bom dia|pode desligar|tenho que (ir|desligar)|depois (eu )?(ligo|retorno))\b/i;
const NEGATIVA = /^\s*(não|nao|nada|tá bom|ta bom|beleza|ok|tudo certo|não,? obrigad[oa])\b/i;

/** The caller said goodbye, or answered "no" to "anything else?". */
export function podeEncerrar(ultimaFalaCliente: string, ultimaFalaAgente: string, concluiuAlgo = false): boolean {
  if (DESPEDIDA.test(ultimaFalaCliente)) return true;
  // "ok" / "não" closes the call only after "anything else?" or once the request was handled
  return (concluiuAlgo || /mais alguma|algo mais|ajudar em mais|mais algum/i.test(ultimaFalaAgente)) && NEGATIVA.test(ultimaFalaCliente);
}

export async function executarFerramenta(nome: string, input: Record<string, unknown>, ctx: CtxFerramenta): Promise<EfeitoFerramenta> {
  const db = getDb();
  const c = ctx.config;
  switch (nome) {
    case "consultar_horarios": {
      if (ctx.mockAgenda === "sem_horarios") return { resultado: { horarios: [] } };
      const fimJanela = new Date(ctx.agora.getTime() + 15 * 86_400_000);
      const ocupados = await db
        .select({ inicio: schema.agendaEventos.inicio, fim: schema.agendaEventos.fim })
        .from(schema.agendaEventos)
        .where(
          and(
            eq(schema.agendaEventos.orgId, ctx.orgId),
            eq(schema.agendaEventos.status, "confirmado"),
            gte(schema.agendaEventos.fim, ctx.agora),
            lt(schema.agendaEventos.inicio, fimJanela),
            ...(ctx.teste ? [] : [eq(schema.agendaEventos.simulado, false)]),
          ),
        );
      const usarGoogle = c.acoes.agendar.agenda === "google" && !ctx.teste;
      const google = usarGoogle ? await ocupadosGoogle(ctx.orgId, ctx.agora, fimJanela) : null;
      const horarios = gerarHorarios({
        horarios: c.horarios,
        ocupados: [...ocupados, ...(google ?? [])],
        aPartirDe: ctx.agora,
        duracaoMin: c.acoes.agendar.duracaoPadraoMin,
        periodo: input.periodo as "manha" | "tarde" | "noite" | undefined,
        dataPreferida: typeof input.data_preferida === "string" ? input.data_preferida : undefined,
        quantidade: 4,
      });
      return { resultado: { horarios } };
    }
    case "agendar": {
      const inicio = new Date(String(input.inicio));
      if (Number.isNaN(inicio.getTime())) return { resultado: { ok: false, erro: "horario_invalido" } };
      const fim = new Date(inicio.getTime() + c.acoes.agendar.duracaoPadraoMin * 60_000);
      const conflito = await db
        .select({ id: schema.agendaEventos.id })
        .from(schema.agendaEventos)
        .where(
          and(
            eq(schema.agendaEventos.orgId, ctx.orgId),
            eq(schema.agendaEventos.status, "confirmado"),
            lt(schema.agendaEventos.inicio, fim),
            gte(schema.agendaEventos.fim, new Date(inicio.getTime() + 1)),
            ...(ctx.teste ? [] : [eq(schema.agendaEventos.simulado, false)]),
          ),
        )
        .limit(1);
      if (conflito.length) return { resultado: { ok: false, erro: "horario_ocupado" } };
      const [ev] = await db
        .insert(schema.agendaEventos)
        .values({
          orgId: ctx.orgId,
          agenteId: ctx.agenteId,
          inicio,
          fim,
          titulo: String(input.servico ?? c.empresa.servicos[0]?.nome ?? "Atendimento"),
          clienteNome: String(input.nome ?? ""),
          clienteTelefone: String(input.telefone ?? ctx.de ?? ""),
          conversaId: ctx.conversaId,
          simulado: ctx.teste,
        })
        .returning();
      if (c.acoes.agendar.agenda === "google" && !ctx.teste)
        await criarEventoGoogle(ctx.orgId, {
          titulo: `${ev.titulo} · ${ev.clienteNome}`,
          descricao: `Agendado pela Recepta. Telefone: ${ev.clienteTelefone || "—"}. ${String(input.observacao ?? "")}`,
          inicio,
          fim,
        });
      return { resultado: { ok: true, eventoId: ev.id, rotulo: rotuloHorario(inicio) } };
    }
    case "transferir_para_humano": {
      const tr = c.acoes.transferir;
      if (!tr.numero) return { resultado: { ok: false, motivo: "sem_numero_configurado", alternativa: "repassar_para_equipe" } };
      if (tr.somenteHorarioComercial && !dentroDoHorario(c.horarios, ctx.agora))
        return { resultado: { ok: false, motivo: "fora_do_horario", alternativa: "repassar_para_equipe" } };
      return { resultado: { ok: true, numero: tr.numero }, transferirPara: tr.numero, encerrar: true };
    }
    case "repassar_para_equipe": {
      const urg = ["baixa", "media", "alta"].includes(String(input.urgencia)) ? (input.urgencia as Urgencia) : "media";
      const dados: Record<string, string> = {};
      for (const [k, v] of Object.entries(input))
        if (!["motivo", "o_que_o_cliente_quer", "urgencia", "nome", "telefone", "proximo_passo"].includes(k) && v != null) dados[k] = String(v);
      // In tests the report is only shown in the test panel (from the tool call); it never reaches the inbox.
      if (ctx.teste) return { resultado: { ok: true, simulado: true, instrucao: "Diga ao cliente que a equipe vai retornar e despeça-se." } };
      const rep = await criarRepasse({
        orgId: ctx.orgId,
        agenteId: ctx.agenteId,
        conversaId: ctx.conversaId,
        motivo: String(input.motivo ?? ""),
        pedido: String(input.o_que_o_cliente_quer ?? ""),
        urgencia: urg,
        proximoPasso: input.proximo_passo ? String(input.proximo_passo) : null,
        contatoNome: input.nome ? String(input.nome) : null,
        contatoTelefone: String(input.telefone ?? ctx.de ?? "") || null,
        dados,
        origem: "agente",
        notificar: c.acoes.repassar?.notificar ?? "ambos",
      });
      return { resultado: { ok: true, repasseId: rep.id, instrucao: "Diga ao cliente que a equipe vai retornar e despeça-se." } };
    }
    // Kept for conversations started before the hand-off tool existed (their message history may reference them).
    case "anotar_recado":
      return executarFerramenta("repassar_para_equipe", { motivo: "Recado", o_que_o_cliente_quer: input.mensagem, urgencia: "media", nome: input.nome, telefone: input.telefone }, ctx);
    case "sinalizar_revisao":
      return executarFerramenta("repassar_para_equipe", { motivo: String(input.motivo ?? "Revisão"), o_que_o_cliente_quer: String(input.motivo ?? "Revisar a conversa"), urgencia: "baixa" }, ctx);
    case "enviar_whatsapp": {
      await enviarSaida(ctx.orgId, { canal: "whatsapp", destino: String(input.telefone ?? ctx.de ?? ""), corpo: String(input.mensagem ?? "") }, { real: !ctx.teste });
      return { resultado: { ok: true } };
    }
    case "encerrar_ligacao": {
      // Safety net: small models sometimes hang up mid-conversation. Only end when the caller said goodbye.
      if (input.motivo !== "trote_ou_abuso" && !podeEncerrar(ctx.ultimaFalaCliente ?? "", ctx.ultimaFalaAgente ?? "", ctx.concluiuAlgo))
        return { resultado: { ok: false, erro: "O cliente ainda não se despediu. Não encerre: continue o atendimento e pergunte se pode ajudar em mais alguma coisa." } };
      return { resultado: { ok: true }, encerrar: true };
    }
    default: {
      const w = c.acoes.webhooks.find((x) => x.nome === nome);
      if (!w) return { resultado: { ok: false, erro: "ferramenta_desconhecida" } };
      if (ctx.teste) return { resultado: { ok: true, simulado: true, nota: "Em teste, webhooks não são chamados de verdade." } };
      try {
        const url = await urlPublicaSegura(w.url);
        const r = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ferramenta: nome, conversaId: ctx.conversaId, parametros: input }),
          signal: AbortSignal.timeout(5000),
        });
        const texto = (await r.text()).slice(0, 2000);
        return { resultado: { ok: r.ok, status: r.status, resposta: texto } };
      } catch (e) {
        return { resultado: { ok: false, erro: e instanceof Error ? e.message : "falha" } };
      }
    }
  }
}
