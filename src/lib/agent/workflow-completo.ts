import type { AgentConfig } from "./config";
import type { Aresta, No, Workflow } from "./workflow";

/**
 * "Atendimento completo": a ready-made flow built from the company's own setup. Every topic of a
 * call has its own step (questions, booking, my appointments, the company's systems, complaints,
 * emergencies, talking to a person) and every step comes back to "Mais alguma coisa?", so one call
 * can solve several things — inside or outside business hours.
 */
export function workflowCompleto(c: AgentConfig): Workflow {
  const nos: No[] = [];
  const arestas: Aresta[] = [];
  let n = 0;
  const no = (id: string, tipo: No["tipo"], titulo: string, texto: string, x: number, y: number) => nos.push({ id, tipo, titulo, texto, x, y });
  const liga = (de: string, para: string, condicao = "") => arestas.push({ id: `c${++n}`, de, para, condicao });

  const agenda = c.acoes.agendar.ativo;
  const apis = c.acoes.apis ?? [];
  const transfere = c.acoes.transferir.ativo && Boolean(c.acoes.transferir.numero);
  const saude = c.empresa.nicho === "clinica";
  const imob = c.empresa.nicho === "imobiliaria";
  const rest = c.empresa.nicho === "restaurante";
  const fimDados = "Nome e telefone só agora, no fim e um por vez: peça o nome se ainda não souber; depois pergunte se pode usar o número de quem está ligando.";
  const soDepois = " NUNCA diga que está marcado antes de usar agendar e ele responder ok; se der erro, ofereça outro horário.";

  // ── entry and triage ──
  no("inicio", "inicio", "Início", "", 520, 0);
  no(
    "recepcao",
    "subagente",
    "Recepção",
    "Entenda o que o cliente precisa (ele pode ter mais de um assunto) e siga para a etapa certa assim que souber; se ele já disse, siga direto. Uma dúvida rápida você pode responder aqui mesmo com consultar_conhecimento. Se a pessoa é reconhecida pelo telefone, use isso para atender melhor. Faça no máximo uma pergunta por vez.",
    520,
    120,
  );
  liga("inicio", "recepcao");

  // ── every topic ──
  const topicos: { id: string; titulo: string; objetivo: string; entra: string }[] = [
    ...(imob
      ? [
          {
            id: "imovel",
            titulo: "Encontrar o imóvel",
            entra: "O cliente procura um imóvel para comprar ou alugar",
            objetivo:
              "Seja consultiva, como um bom corretor: entenda o que a pessoa procura (comprar ou alugar, região/bairro, faixa de preço, quantos quartos, algo indispensável), UMA pergunta por vez e reagindo ao que ela diz. Assim que tiver região OU faixa de preço — ou se o cliente perguntar 'o que vocês têm' — use consultar_conhecimento na hora e mostre 1 ou 2 opções concretas (tipo, bairro, preço) antes de perguntar mais; não peça a região de novo se ele já respondeu outra coisa. Se ela gostar de algum, ofereça visitar. Não peça nome nem telefone nesta etapa.",
          },
        ]
      : []),
    {
      id: "duvidas",
      titulo: "Dúvidas",
      entra: "O cliente quer uma informação (serviços, preços, horários, endereço, pagamento, convênios, regras, como funciona)",
      objetivo:
        "Responda a dúvida com as informações da empresa. Se não estiver no que você já sabe, use consultar_conhecimento antes de responder. Nunca invente preço, prazo ou regra: se não encontrar, diga que vai confirmar com a equipe. Depois de responder, ofereça o próximo passo natural (ex.: marcar um horário).",
    },
    ...(agenda
      ? [
          {
            id: "agendar",
            titulo: imob ? "Marcar visita" : rest ? "Reservar mesa" : "Agendar",
            entra: imob ? "O cliente quer visitar um imóvel" : rest ? "O cliente quer reservar uma mesa" : "O cliente quer marcar um horário",
            objetivo: imob
              ? `A visita é NO IMÓVEL, com um corretor (não no escritório). Confirme qual imóvel, use consultar_horarios e ofereça duas opções numa frase. Quando ele escolher: ${fimDados} Repita imóvel, dia e hora e, com o sim, use agendar com servico "Visita: <imóvel>" e o endereço do imóvel na observação.${soDepois}`
              : rest
                ? `Pergunte para quantas pessoas e o dia/horário, use consultar_horarios e ofereça duas opções numa frase. Quando ele escolher: ${fimDados} Repita pessoas, dia e hora e, com o sim, use agendar com servico "Mesa para <N>".${soDepois}`
                : "Nesta ordem: 1) se o cliente não disse o serviço, pergunte; 2) use consultar_horarios (com o dia e o período que ele pediu) e ofereça no máximo duas opções; 3) quando ele escolher, peça o nome; 4) se você sabe o telefone de quem liga (está no contexto), pergunte se pode usar esse número em vez de pedir de novo; 5) repita serviço, dia e hora e, com o sim dele, use agendar — nunca diga que está marcado antes de agendar responder ok. Uma pergunta por vez. Fora do horário de atendimento você também pode marcar para os próximos dias.",
          },
          {
            id: "meus",
            titulo: "Remarcar ou cancelar",
            entra: "O cliente quer remarcar, cancelar ou confirmar um horário que já tem",
            objetivo:
              "Use consultar_agendamentos para achar o horário dele. Para remarcar: consulte horários livres, confirme o novo horário e use remarcar_agendamento. Para cancelar: confirme qual é, ofereça remarcar antes e, se ele mantiver, use cancelar_agendamento. Para confirmar: diga dia e hora.",
          },
        ]
      : []),
    ...(apis.length
      ? [
          {
            id: "sistemas",
            titulo: "Consultar sistemas",
            entra: `O cliente pergunta algo que está nos sistemas da empresa (${apis.map((a) => a.descricao.split(".")[0].toLowerCase()).join("; ")})`,
            objetivo: `Use a ferramenta certa (${apis.map((a) => a.nome).join(", ")}) com os dados que o cliente informar, pedindo um de cada vez. Responda só com o que voltou da consulta. Se der erro ou não encontrar, peça para conferir o dado uma vez; se continuar, registre com repassar_para_equipe.`,
          },
        ]
      : []),
    {
      id: "reclamacao",
      titulo: "Reclamação",
      entra: "O cliente está insatisfeito, reclama de algo ou relata um problema com o serviço",
      objetivo:
        "Acolha com calma e empatia, peça desculpas pelo transtorno sem culpar ninguém, entenda o que aconteceu e o que o cliente espera. Registre com repassar_para_equipe com urgência alta e diga quando a equipe vai retornar. Não prometa reembolso, desconto ou prazo que não estejam nas regras.",
    },
    {
      id: "pessoa",
      titulo: "Falar com alguém",
      entra: "O cliente pede para falar com uma pessoa, com o dono, com um profissional específico, ou o pedido depende de uma decisão da equipe",
      objetivo: "",
    },
  ];

  const xs = [-180, 100, 380, 660, 940, 1220];
  topicos.forEach((t, i) => {
    if (t.id !== "pessoa") no(t.id, "subagente", t.titulo, t.objetivo, xs[i] ?? 100 + i * 280, 340);
    liga("recepcao", t.id === "pessoa" ? "decide_pessoa" : t.id, t.entra);
  });

  // ── talking to a person: transfer during business hours, otherwise hand the case over ──
  no("decide_pessoa", "condicao", "Dá para transferir?", "", 1220, 340);
  no(
    "recado",
    "subagente",
    "Passar para a equipe",
    "Diga que vai passar o pedido para a equipe e quando ela retorna (se estiver fora do horário, diga quando a equipe volta). Confirme nome e telefone, um de cada vez, entenda o motivo e use repassar_para_equipe com um relatório claro.",
    1360,
    560,
  );
  if (transfere) {
    no("transferir", "transferir", "Transferir", "", 1100, 560);
    liga("decide_pessoa", "transferir", "dentro_do_horario = sim");
  }
  liga("decide_pessoa", "recado", "");

  // ── health emergencies (clinics) ──
  if (saude) {
    no("emergencia", "falar", "Orientar emergência", "Se for uma emergência, ligue agora para o SAMU, no 192, ou vá ao pronto-socorro mais próximo.", 1500, 340);
    no("emergencia_repasse", "acao", "Avisar a equipe", "repassar_para_equipe", 1500, 460);
    liga("recepcao", "emergencia", "O cliente descreve uma emergência ou sintoma grave (dor forte, sangramento, falta de ar, desmaio)");
    liga("emergencia", "emergencia_repasse");
    liga("emergencia_repasse", "fechamento", "sucesso");
    liga("emergencia_repasse", "fechamento", "falha");
  }

  // ── anything else? (lets one call solve several things) ──
  no(
    "fechamento",
    "subagente",
    "Mais alguma coisa?",
    "Confirme o que foi feito em uma frase e pergunte se pode ajudar em mais alguma coisa. Se o cliente trouxer outro assunto, siga para ele. Se não, despeça-se usando o nome do cliente (se souber) e use encerrar_ligacao.",
    520,
    780,
  );
  no("fim", "fim", "Fim", "", 520, 940);
  for (const t of topicos.filter((x) => x.id !== "pessoa")) {
    liga(t.id, "fechamento", "O assunto foi resolvido ou registrado");
    liga(t.id, "recepcao", "O cliente mudou de assunto antes de terminar este");
  }
  if (agenda) liga("duvidas", "agendar", "O cliente decidiu marcar um horário");
  if (imob && agenda) liga("imovel", "agendar", "O cliente quer visitar um dos imóveis");
  liga("recado", "fechamento", "O pedido foi registrado para a equipe");
  liga("fechamento", "recepcao", "O cliente tem outro assunto");
  liga("fechamento", "fim", "O cliente não precisa de mais nada e você já se despediu");

  return { ativo: true, nos, arestas };
}
