import type { Aresta, No, TipoNo, Workflow } from "@/lib/agent/workflow";
import { brl, ehNao, lista, lerHorario, type Perfil } from "./perfil";

/** A themed column of the canvas (also where the builder cursors fly to). */
export interface Secao {
  id: string;
  titulo: string;
  x: number;
  y: number;
  nos: string[];
}

export interface FluxoGerado {
  workflow: Workflow;
  secoes: Secao[];
}

const LARGURA = 280;
const PASSO_Y = 104;
const TOPO_FAIXAS = 640;

/**
 * Builds the business's own service flow from what the onboarding learned. Deterministic (same
 * profile → same flow) and grows with every answer: a complete profile yields 100+ steps with a
 * clear beginning (entrada), middle (one lane per topic) and end (fechamento).
 */
export function gerarFluxo(p: Perfil): FluxoGerado {
  const f = p.campos;
  const nos: No[] = [];
  const arestas: Aresta[] = [];
  const secoes: Secao[] = [];
  let na = 0;
  let faixa: Secao | null = null;
  let yFaixa = 0;

  const add = (id: string, tipo: TipoNo, titulo: string, texto = "", dx = 0): string => {
    if (nos.some((n) => n.id === id)) return id;
    const s = faixa!;
    nos.push({ id, tipo, titulo: titulo.slice(0, 60), texto: texto.slice(0, 2000), x: s.x + dx, y: yFaixa });
    s.nos.push(id);
    yFaixa += PASSO_Y;
    return id;
  };
  const liga = (de: string, para: string, condicao = "") => {
    if (!arestas.some((a) => a.de === de && a.para === para && a.condicao === condicao)) arestas.push({ id: `c${++na}`, de, para, condicao: condicao.slice(0, 200) });
  };
  const novaFaixa = (id: string, titulo: string, x?: number, y = TOPO_FAIXAS) => {
    faixa = { id, titulo, x: x ?? (secoes.filter((s) => s.y === TOPO_FAIXAS).length * LARGURA), y, nos: [] };
    secoes.push(faixa);
    yFaixa = y + 40;
  };

  const empresa = f.empresa_nome || "a empresa";
  const cat = f.categoria || "";
  const agenda = cat ? f.agenda !== "nao" : false;
  const marcar = cat === "imobiliaria" ? "visita" : cat === "clinica" ? "consulta" : cat === "restaurante" ? "reserva" : "horário";
  const semana = f.horario ? lerHorario(f.horario) : null;
  const volta = semana ? proximaAbertura(semana) : "no próximo dia útil";
  const temNumero = (n?: string) => Boolean(n && !ehNao(n));
  const nunca = lista(f.nunca);
  const regraNunca = nunca.length ? ` Nunca: ${nunca.join("; ")}.` : "";

  /* ───────── fim (reserved first so every lane can point to it) ───────── */
  const FECH = "fechamento";
  const RECEP = "recepcao";
  const RECEP_FORA = "recepcao_fora";
  const VIP = "atendimento_vip";
  const recepcoes: string[] = [RECEP];

  /* ───────── entrada ───────── */
  novaFaixa("entrada", "Entrada", 0, 0);
  add("inicio", "inicio", "Início");
  if (f.vip && !ehNao(f.vip) && cat) {
    add("cliente_conhecido", "condicao", "Cliente conhecido?");
    add("marca_vip", "atualizar_estado", "Marcar prioridade", "prioridade=alta", -LARGURA * 0.9);
    liga("inicio", "cliente_conhecido");
    liga("cliente_conhecido", "marca_vip", "cliente_identificado = sim");
    liga("marca_vip", VIP);
    liga("cliente_conhecido", "dentro_horario", "");
  } else liga("inicio", "dentro_horario");
  add("dentro_horario", "condicao", "Dentro do horário?");
  add("periodo_comercial", "atualizar_estado", "Horário comercial", "periodo=comercial", -LARGURA * 0.5);
  add("periodo_fora", "atualizar_estado", "Fora do horário", "periodo=fora", LARGURA * 0.5);
  liga("dentro_horario", "periodo_comercial", "dentro_do_horario = sim");
  liga("dentro_horario", f.horario ? "periodo_fora" : "periodo_comercial", "");
  liga("periodo_comercial", RECEP);
  liga("periodo_fora", f.horario ? RECEP_FORA : RECEP);

  add(
    RECEP,
    "subagente",
    "Recepção",
    `Entenda o que o cliente precisa (pode ser mais de um assunto) e siga para a etapa certa assim que souber. Se ele já disse, siga direto. Uma pergunta por vez, tom ${f.tom === "formal" ? "formal e cordial" : f.tom === "descontraido" ? "leve e descontraído" : "simpático e natural"}.${regraNunca}`,
    -LARGURA * 0.5,
  );
  if (f.horario) {
    recepcoes.push(RECEP_FORA);
    add(
      RECEP_FORA,
      "subagente",
      "Recepção fora do horário",
      `A empresa está fechada agora (horário: ${f.horario}). Avise com naturalidade, mas resolva o que der: ${
        f.fora === "marcar" && agenda ? `você pode marcar ${marcar} para os próximos dias` : "anote o pedido completo para a equipe"
      }${f.fora === "plantao" ? "; se for urgência, siga para o plantão" : ""}. A equipe volta ${volta}.${regraNunca}`,
      LARGURA * 0.5,
    );
  }
  if (f.vip && !ehNao(f.vip) && cat) {
    recepcoes.push(VIP);
    add(VIP, "subagente", "Atendimento VIP", `Cliente conhecido e prioritário: cumprimente pelo nome (cliente_nome), sem pedir dados que já temos. ${f.vip.length > 4 ? `Regra da empresa: ${f.vip}.` : ""} Entenda o pedido e siga para a etapa certa.`, -LARGURA * 1.2);
  }

  if (!cat) {
    // before knowing the business there's only the skeleton
    novaFaixa("fim", "Fim", 0, TOPO_FAIXAS);
    add(FECH, "subagente", "Mais alguma coisa?", "Confirme o que foi feito e pergunte se pode ajudar em mais alguma coisa.");
    add("fim", "fim", "Fim");
    liga(RECEP, FECH, "O pedido do cliente foi resolvido");
    liga(FECH, "fim", "O cliente não precisa de mais nada e você já se despediu");
    liga(FECH, RECEP, "O cliente tem outro assunto");
    if (f.horario) {
      liga(RECEP_FORA, FECH, "O pedido do cliente foi resolvido ou anotado");
      liga(FECH, RECEP_FORA, "O cliente tem outro assunto fora do horário");
    }
    return { workflow: { ativo: true, nos, arestas }, secoes };
  }

  /** A topic reachable from the receptions, that returns to "Mais alguma coisa?". */
  const topico = (id: string, titulo: string, entra: string, objetivo: string, opts: { de?: string[]; dx?: number; voltar?: boolean } = {}) => {
    add(id, "subagente", titulo, objetivo, opts.dx ?? 0);
    for (const r of opts.de ?? recepcoes) liga(r, id, entra);
    liga(id, FECH, "O assunto foi resolvido ou registrado");
    if (opts.voltar !== false) liga(id, RECEP, "O cliente mudou de assunto antes de terminar este");
    return id;
  };
  /** Hand-off with a report, then a spoken return promise. */
  const repasse = (id: string, de: string, condicao: string, retorno: string) => {
    add(id, "acao", "Passar para a equipe", "repassar_para_equipe", LARGURA * 0.35);
    add(`${id}_ok`, "falar", "Avisar retorno", retorno, LARGURA * 0.35);
    add(`${id}_erro`, "falar", "Anotado mesmo assim", "Anotei tudo aqui e a equipe vai te retornar, pode ficar tranquilo.", LARGURA * 0.35);
    liga(de, id, condicao);
    liga(id, `${id}_ok`, "sucesso");
    liga(id, `${id}_erro`, "falha");
    liga(`${id}_ok`, FECH);
    liga(`${id}_erro`, FECH);
    return id;
  };
  const quandoVolta = `A equipe te retorna ${volta}.`;

  /* ───────── vendedores ───────── */
  if (f.vendedores === "sim") {
    novaFaixa("vendedores", "Vendedores e spam");
    add("spam_dispensa", "falar", "Dispensar com educação", `Obrigada pelo contato! No momento a ${empresa} não tem interesse, mas agradeço. Tenha um ótimo dia!`);
    add("spam_estado", "atualizar_estado", "Marcar como spam", "resultado=spam");
    add("spam_fim", "fim", "Encerrar");
    for (const r of recepcoes) liga(r, "spam_dispensa", "Quem ligou é vendedor, telemarketing ou oferece um serviço para a empresa");
    liga("spam_dispensa", "spam_estado");
    liga("spam_estado", "spam_fim");
  }

  /* ───────── dúvidas e serviços ───────── */
  novaFaixa("duvidas", "Dúvidas");
  topico(
    "duvidas",
    "Dúvidas",
    "O cliente quer uma informação (preço, endereço, como funciona, formas de pagamento)",
    `Responda com as informações da empresa${f.site && !ehNao(f.site) ? ` (inclusive o site ${f.site})` : ""}. Nunca invente preço, prazo ou regra. Depois de responder, ofereça o próximo passo natural${agenda ? ` (marcar ${marcar})` : ""}.${regraNunca}`,
  );
  add("duvidas_consulta", "acao", "Consultar a base", "consultar_conhecimento", LARGURA * 0.35);
  add("duvidas_resposta", "subagente", "Responder com a base", "Responda em uma ou duas frases com o que voltou da consulta, sem ler listas. Se não encontrou, diga que vai confirmar com a equipe.", LARGURA * 0.35);
  liga("duvidas", "duvidas_consulta", "A resposta não está no que você já sabe");
  liga("duvidas_consulta", "duvidas_resposta", "sucesso");
  liga("duvidas_resposta", FECH, "O cliente ficou satisfeito com a resposta");
  repasse("duvidas_repasse", "duvidas_resposta", "A informação não foi encontrada e o cliente precisa dela", `Vou confirmar isso com a equipe e te retornam ${volta}.`);
  liga("duvidas_consulta", "duvidas_repasse", "falha");
  const servicos = lista(f.servicos).slice(0, 6);
  servicos.forEach((s, i) => {
    const id = `serv_${i + 1}`;
    add(id, "subagente", `Sobre: ${s.split(/[-–:(]| R\$/)[0].trim()}`, `O cliente quer saber de "${s}". Explique de forma simples, com o preço se houver, e reaja ao que ele disser.${agenda ? ` Se ele se interessar, ofereça marcar ${marcar}.` : ""}`, -LARGURA * 0.2);
    liga("duvidas", id, `O cliente pergunta sobre ${s.split(/[-–:(]| R\$/)[0].trim()}`);
    liga(id, FECH, "A dúvida foi respondida");
    liga(id, "duvidas_consulta", "Precisa de detalhe que você não sabe");
  });

  /* ───────── motivos comuns (each becomes its own path) ───────── */
  const cobertos = /marc|agend|visita|reserv|pre[cç]o|valor|hor[aá]rio|endere|reclam|boleto|convenio|convênio|delivery|or[cç]amento|anunci|im[oó]ve/i;
  const motivos = lista(f.motivos).filter((m) => !cobertos.test(m)).slice(0, 5);
  if (motivos.length) {
    novaFaixa("motivos", "Motivos frequentes");
    motivos.forEach((m, i) => {
      const id = `motivo_${i + 1}`;
      topico(id, m.slice(0, 50), `O cliente liga por: ${m}`, `Motivo frequente de ligação: "${m}". Entenda o caso, resolva com as informações da empresa e, se depender da equipe, passe o caso com um relatório claro.`);
      if (i === 0) repasse("motivos_repasse", id, "O caso depende de alguém da equipe", `Já passei pra equipe e ${quandoVolta.toLowerCase()}`);
      else liga(id, "motivos_repasse", "O caso depende de alguém da equipe");
    });
  }

  /* ───────── agenda ───────── */
  if (agenda) {
    novaFaixa("agenda", cat === "imobiliaria" ? "Visitas" : cat === "restaurante" ? "Reservas" : "Agenda");
    const visita = cat === "imobiliaria";
    topico(
      "agendar",
      visita ? "Marcar visita" : cat === "restaurante" ? "Reservar mesa" : "Agendar",
      visita ? "O cliente quer visitar um imóvel" : cat === "restaurante" ? "O cliente quer reservar uma mesa" : `O cliente quer marcar ${marcar}`,
      visita
        ? `A visita é NO IMÓVEL, com um corretor. Confirme qual imóvel e o melhor dia e período.${f.visita_requisitos && !ehNao(f.visita_requisitos) ? ` Avise antes de confirmar: ${f.visita_requisitos}.` : ""}`
        : cat === "restaurante"
          ? `Pergunte para quantas pessoas e o dia/horário.${f.reserva_max && !ehNao(f.reserva_max) ? ` Reservas até ${f.reserva_max} pessoas; acima disso é evento.` : ""}`
          : `Entenda qual ${f.especialidades && !ehNao(f.especialidades) ? "especialidade/profissional" : "serviço"} e o melhor dia e período. Uma pergunta por vez.`,
    );
    const iFora = arestas.findIndex((a) => a.de === RECEP_FORA && a.para === "agendar");
    if (f.fora !== "marcar" && iFora >= 0) arestas.splice(iFora, 1);
    add("ag_horarios", "acao", "Consultar horários", "consultar_horarios", LARGURA * 0.3);
    add("ag_oferecer", "subagente", "Oferecer horários", "Ofereça no máximo duas opções numa frase só e espere o cliente escolher.", LARGURA * 0.3);
    add("ag_dados", "subagente", "Nome e telefone", "Agora, no fim e um por vez: peça o nome se ainda não souber; depois pergunte se pode usar o número de quem está ligando. Repita o que vai ser marcado e peça a confirmação.", LARGURA * 0.3);
    add("ag_marcar", "acao", "Marcar na agenda", "agendar", LARGURA * 0.3);
    add("ag_marcado", "atualizar_estado", "Marcado", "agendado=sim", LARGURA * 0.3);
    add("ag_outro", "subagente", "Horário ocupado", "O horário acabou de ser ocupado ou deu erro. Peça desculpas e ofereça outro horário. Nunca diga que está marcado.", -LARGURA * 0.3);
    add("ag_sem_horario", "subagente", "Sem horário livre", "Não há horários livres no período pedido. Ofereça outro dia ou período; se nada servir, anote o pedido para a equipe encaixar.", -LARGURA * 0.3);
    liga("agendar", "ag_horarios", "Você já sabe o dia ou período que o cliente quer");
    liga("ag_horarios", "ag_oferecer", "sucesso");
    liga("ag_horarios", "ag_sem_horario", "falha");
    liga("ag_oferecer", "ag_dados", "O cliente escolheu um horário");
    liga("ag_oferecer", "ag_horarios", "O cliente quer outro dia ou período");
    liga("ag_dados", "ag_marcar", "O cliente confirmou os dados e o horário");
    liga("ag_dados", "ag_oferecer", "O cliente quer mudar o horário");
    liga("ag_marcar", "ag_marcado", "sucesso");
    liga("ag_marcar", "ag_outro", "falha");
    liga("ag_outro", "ag_horarios", "O cliente aceitou ver outro horário");
    liga("ag_outro", FECH, "O cliente desistiu por agora");
    liga("ag_sem_horario", "ag_horarios", "O cliente sugeriu outro dia ou período");
    repasse("ag_encaixe", "ag_sem_horario", "Nenhum horário serviu e o cliente quer um encaixe", `Anotei seu pedido de encaixe e a equipe te retorna ${volta} com um horário.`);
    let depois = "ag_marcado";
    if (visita && f.visita_requisitos && !ehNao(f.visita_requisitos)) {
      add("ag_lembrete_visita", "falar", "Combinar a visita", `Só pra lembrar: ${f.visita_requisitos}.`, LARGURA * 0.3);
      liga(depois, "ag_lembrete_visita");
      depois = "ag_lembrete_visita";
    }
    if (f.confirmacao === "sim") {
      add("ag_whats", "acao", "Confirmar no WhatsApp", "enviar_whatsapp", LARGURA * 0.3);
      add("ag_whats_ok", "falar", "Avisar confirmação", "Te mandei a confirmação no WhatsApp com todos os detalhes.", LARGURA * 0.3);
      liga(depois, "ag_whats");
      liga("ag_whats", "ag_whats_ok", "sucesso");
      liga("ag_whats", FECH, "falha");
      liga("ag_whats_ok", FECH);
    } else liga(depois, FECH);

    // my appointments
    topico("meus", "Remarcar ou cancelar", `O cliente quer remarcar, cancelar ou confirmar ${marcar === "reserva" ? "uma reserva" : `um${marcar === "visita" || marcar === "consulta" ? "a" : ""} ${marcar}`} que já tem`, "Ache o horário do cliente antes de qualquer coisa.", { dx: -LARGURA * 0.3 });
    add("meus_buscar", "acao", "Buscar agendamentos", "consultar_agendamentos", -LARGURA * 0.3);
    add("meus_decidir", "subagente", "O que fazer com o horário", `Confirme qual é o horário. Para confirmar, diga dia e hora.${f.cancelamento && !ehNao(f.cancelamento) ? ` Regra de cancelamento: ${f.cancelamento}.` : ""} Antes de cancelar, ofereça remarcar.`, -LARGURA * 0.3);
    add("meus_remarcar", "acao", "Remarcar", "remarcar_agendamento", -LARGURA * 0.3);
    add("meus_cancelar", "acao", "Cancelar", "cancelar_agendamento", -LARGURA * 0.3);
    add("meus_nao_achou", "subagente", "Não encontrei o horário", "Não achei agendamento com esses dados. Confira o nome ou o telefone uma vez; se continuar sem achar, ofereça marcar um novo.", -LARGURA * 0.3);
    add("meus_cancelado", "atualizar_estado", "Cancelado", "cancelado=sim", -LARGURA * 0.3);
    liga("meus", "meus_buscar", "Você sabe o nome ou o telefone do cliente");
    liga("meus_buscar", "meus_decidir", "sucesso");
    liga("meus_buscar", "meus_nao_achou", "falha");
    liga("meus_decidir", "ag_horarios", "O cliente quer remarcar e ainda não escolheu o novo horário");
    liga("meus_decidir", "meus_remarcar", "O cliente escolheu o novo horário e confirmou");
    liga("meus_decidir", "meus_cancelar", "O cliente confirmou que quer cancelar mesmo depois da oferta de remarcar");
    liga("meus_decidir", FECH, "O cliente só queria confirmar o horário");
    liga("meus_remarcar", FECH, "sucesso");
    liga("meus_remarcar", "ag_outro", "falha");
    liga("meus_cancelar", "meus_cancelado", "sucesso");
    liga("meus_cancelar", FECH, "falha");
    liga("meus_cancelado", FECH);
    liga("meus_nao_achou", "agendar", "O cliente quer marcar um novo horário");
    liga("meus_nao_achou", "meus_buscar", "O cliente passou outro nome ou telefone");
  }

  /* ───────── nicho: imobiliária ───────── */
  if (cat === "imobiliaria") {
    const alto = Number(f.alto_valor);
    const temAlto = Number.isFinite(alto) && alto > 0;
    const regioes = lista(f.regioes);
    const qualifica = (o: "comprar" | "alugar") =>
      `Seja consultiva, como um bom corretor: entenda o que a pessoa procura para ${o} (tipo, bairro${regioes.length ? ` — atendemos ${regioes.join(", ")}` : ""}, faixa de preço, quartos, algo indispensável), UMA pergunta por vez. Assim que tiver região OU faixa de preço, consulte e mostre 1 ou 2 opções concretas. Não peça nome nem telefone nesta etapa.`;
    if (f.operacao !== "locacao") {
      novaFaixa("compra", "Compra");
      topico("compra", "Quero comprar", "O cliente quer comprar um imóvel", qualifica("comprar"));
      add("compra_busca", "acao", "Buscar imóveis à venda", "consultar_conhecimento", LARGURA * 0.3);
      add("compra_opcoes", "subagente", "Apresentar opções de compra", "Mostre 1 ou 2 opções concretas (tipo, bairro, preço) numa frase e reaja ao que o cliente achar.", LARGURA * 0.3);
      add("compra_sem", "subagente", "Nada no perfil (compra)", "Não há imóvel no perfil agora. Diga que vai pedir para um corretor garimpar e confirme o que é indispensável para ele.", -LARGURA * 0.3);
      liga("compra", "compra_busca", "Você já sabe a região ou a faixa de preço");
      liga("compra_busca", "compra_opcoes", "sucesso");
      liga("compra_busca", "compra_sem", "falha");
      liga("compra_opcoes", "compra_busca", "O cliente quer ver outras opções");
      if (agenda) liga("compra_opcoes", "agendar", "O cliente quer visitar um dos imóveis");
      liga("compra_opcoes", FECH, "O cliente vai pensar e não precisa de mais nada");
      repasse("compra_garimpo", "compra_sem", "O cliente aceitou que um corretor procure para ele", "Combinado! Um corretor vai garimpar e te liga com opções no seu perfil.");
    }
    if (f.operacao !== "venda" && f.operacao) {
      novaFaixa("locacao", "Locação");
      topico("locacao", "Quero alugar", "O cliente quer alugar um imóvel", qualifica("alugar"));
      add("loc_busca", "acao", "Buscar imóveis para alugar", "consultar_conhecimento", LARGURA * 0.3);
      add("loc_opcoes", "subagente", "Apresentar opções de aluguel", "Mostre 1 ou 2 opções (bairro, valor do aluguel + condomínio) numa frase e reaja ao que o cliente achar.", LARGURA * 0.3);
      add("loc_garantias", "subagente", "Garantias do aluguel", "Explique as garantias aceitas (fiador, seguro-fiança, caução ou título de capitalização) de forma simples, sem ler lista; pergunte qual faz mais sentido para ele.", LARGURA * 0.3);
      add("loc_docs", "subagente", "Documentos para alugar", "Explique em uma frase os documentos básicos (RG/CPF, comprovante de renda e de residência) e diga que o corretor confirma o restante.", LARGURA * 0.3);
      liga("locacao", "loc_busca", "Você já sabe a região ou o valor que o cliente pode pagar");
      liga("loc_busca", "loc_opcoes", "sucesso");
      liga("loc_busca", "locacao", "falha");
      liga("loc_opcoes", "loc_garantias", "O cliente pergunta sobre fiador, garantia ou caução");
      liga("loc_opcoes", "loc_docs", "O cliente pergunta que documentos precisa");
      liga("loc_garantias", "loc_docs", "O cliente quer saber dos documentos");
      if (agenda) {
        liga("loc_opcoes", "agendar", "O cliente quer visitar um dos imóveis");
        liga("loc_garantias", "agendar", "O cliente quer visitar o imóvel");
        liga("loc_docs", "agendar", "O cliente quer visitar o imóvel");
      }
      liga("loc_garantias", FECH, "A dúvida foi respondida");
      liga("loc_docs", FECH, "A dúvida foi respondida");
      liga("loc_opcoes", FECH, "O cliente vai pensar e não precisa de mais nada");
    }
    if (temAlto) {
      novaFaixa("alto_padrao", "Alto padrão");
      const de = ["compra_opcoes", "locacao", "compra"].filter((x) => nos.some((n) => n.id === x));
      add("alto_marca", "atualizar_estado", "Cliente alto padrão", "segmento=alto_padrao");
      for (const x of de) liga(x, "alto_marca", `O imóvel de interesse custa ${brl(alto)} ou mais`);
      add("alto_padrao", "subagente", "Atendimento alto padrão", `Cliente de alto padrão (imóveis a partir de ${brl(alto)}). Atendimento discreto e cuidadoso: entenda o que é indispensável e o melhor horário para contato. Regra da empresa: ${f.alto_acao && !ehNao(f.alto_acao) ? f.alto_acao : "passar para o corretor sênior"}.`);
      liga("alto_marca", "alto_padrao");
      liga("alto_padrao", RECEP, "O cliente mudou de assunto");
      if (/transf|liga|na hora/i.test(f.alto_acao ?? "") && temNumero(f.transferir_numero)) {
        add("alto_horario", "condicao", "Corretor disponível?", "", LARGURA * 0.3);
        add("alto_transferir", "transferir", "Transferir ao corretor sênior", f.transferir_numero!, LARGURA * 0.3);
        liga("alto_padrao", "alto_horario", "Você já entendeu o que o cliente procura");
        liga("alto_horario", "alto_transferir", "dentro_do_horario = sim");
        repasse("alto_repasse", "alto_horario", "", "Perfeito. O corretor responsável por imóveis desse perfil vai te ligar pessoalmente.");
      } else repasse("alto_repasse", "alto_padrao", "Você já entendeu o que o cliente procura", "Perfeito. O corretor responsável por imóveis desse perfil vai te ligar pessoalmente.");
    }
    if (f.financiamento && f.operacao !== "locacao") {
      novaFaixa("financiamento", "Financiamento");
      const de = ["compra", "compra_opcoes"].filter((x) => nos.some((n) => n.id === x));
      if (f.financiamento === "explica") {
        topico("fin_explica", "Explicar financiamento", "O cliente pergunta sobre financiamento, FGTS ou entrada", "Explique o básico em linguagem simples: entrada (em geral 20%), uso do FGTS, simulação no banco e prazo. Não prometa aprovação nem taxa.", { de: [...recepcoes, ...de] });
        add("fin_renda", "subagente", "Pré-análise", "Se o cliente quiser simular, pergunte a renda familiar aproximada e se vai usar FGTS (uma por vez).");
        liga("fin_explica", "fin_renda", "O cliente quer simular o financiamento");
        repasse("fin_repasse", "fin_renda", "Você já tem a renda e se usa FGTS", "Anotei! Nosso correspondente bancário te liga com a simulação.");
      } else {
        topico("fin_coleta", "Financiamento com a equipe", "O cliente pergunta sobre financiamento, FGTS ou entrada", "Diga que um especialista da equipe cuida disso e colete renda familiar aproximada e se usa FGTS, um de cada vez.", { de: [...recepcoes, ...de] });
        repasse("fin_repasse", "fin_coleta", "Você já tem a renda e se usa FGTS", "Anotei! Nosso correspondente bancário te liga com a simulação.");
      }
    }
    if (f.captacao === "sim") {
      novaFaixa("captacao", "Captação");
      topico("captacao", "Anunciar imóvel", "Um proprietário quer vender, alugar ou anunciar o imóvel dele", "Agradeça o interesse e conte como funciona a parceria em uma frase.");
      add("cap_dados", "subagente", "Dados do imóvel", "Pergunte, um de cada vez: tipo do imóvel, bairro, metragem aproximada e valor pretendido. Depois nome e telefone.");
      liga("captacao", "cap_dados", "O proprietário quer seguir");
      if (agenda) liga("cap_dados", "agendar", "O proprietário quer marcar uma avaliação no imóvel");
      repasse("cap_repasse", "cap_dados", "Você já tem os dados do imóvel e o contato", "Show! Nosso time de captação te liga pra combinar a avaliação.");
    }
    if (f.inquilino && f.operacao !== "venda") {
      novaFaixa("inquilino", "Inquilinos");
      topico("inquilino", "Atendimento ao inquilino", "Quem liga é inquilino (boleto, manutenção, problema no imóvel, contrato)", `Identifique o imóvel e o problema. Regra da empresa: ${f.inquilino}.`);
      add("inq_urgente", "subagente", "Urgência no imóvel", "Vazamento, sem luz, gás ou risco: acalme, oriente o básico de segurança (fechar registro/disjuntor) e colete endereço e contato.", LARGURA * 0.3);
      add("inq_boleto", "subagente", "Boleto e segunda via", "Identifique o contrato (endereço do imóvel e nome do titular) para a segunda via ou dúvida de valor/reajuste.", -LARGURA * 0.3);
      add("inq_manut", "subagente", "Manutenção", "Problema não urgente: descreva o que é, desde quando e o melhor horário para a visita técnica.");
      liga("inquilino", "inq_urgente", "É urgente: vazamento, sem luz, cheiro de gás ou risco");
      liga("inquilino", "inq_boleto", "É sobre boleto, segunda via, valor ou reajuste");
      liga("inquilino", "inq_manut", "É manutenção sem urgência");
      if (temNumero(f.plantao_numero)) {
        add("inq_plantao", "transferir", "Plantão de manutenção", f.plantao_numero!, LARGURA * 0.3);
        liga("inq_urgente", "inq_plantao", "Você já tem endereço e contato e a urgência é real");
      }
      repasse("inq_urg_rep", "inq_urgente", "Você já tem endereço e contato", "Registrei como urgente e já avisei a equipe. Alguém te liga em instantes.");
      if (f.sistemas && !ehNao(f.sistemas)) {
        add("inq_cadastro", "acao", "Consultar contrato", "consultar_cadastro_cliente", -LARGURA * 0.3);
        add("inq_cadastro_ok", "subagente", "Responder sobre o contrato", "Responda só com o que voltou da consulta (vencimento, valor). Para a segunda via, combine o envio pelo WhatsApp.", -LARGURA * 0.3);
        liga("inq_boleto", "inq_cadastro", "Você já sabe o imóvel ou o titular");
        liga("inq_cadastro", "inq_cadastro_ok", "sucesso");
        liga("inq_cadastro", "inq_bol_rep", "falha");
        liga("inq_cadastro_ok", FECH, "O inquilino foi atendido");
      }
      repasse("inq_bol_rep", "inq_boleto", "Você já sabe o imóvel ou o titular", "Anotei! A equipe te manda a segunda via pelo WhatsApp.");
      repasse("inq_man_rep", "inq_manut", "Você já sabe o problema e o melhor horário", "Pronto, a manutenção vai entrar em contato pra marcar a visita técnica.");
    }
    if (regioes.length) {
      novaFaixa("regioes", "Fora da região");
      topico("fora_regiao", "Fora da região", `O cliente procura imóvel fora das regiões atendidas (${regioes.join(", ")})`, `Explique com jeitinho que a ${empresa} atende ${regioes.join(", ")}; pergunte se uma região próxima serve.`, { de: [...recepcoes, ...["compra", "locacao"].filter((x) => nos.some((n) => n.id === x))] });
      repasse("regiao_rep", "fora_regiao", "O cliente quer deixar o contato mesmo assim", "Anotei seu contato! Se entrar algo nessa região, a gente te avisa.");
    }
  }

  /* ───────── nicho: clínica ───────── */
  if (cat === "clinica") {
    const esp = lista(f.especialidades).slice(0, 6);
    if (esp.length) {
      novaFaixa("especialidades", "Especialidades");
      esp.forEach((e, i) =>
        topico(`esp_${i + 1}`, e.slice(0, 50), `O ${"paciente"} procura ${e}`, `O paciente procura ${e}. Entenda o motivo em uma pergunta (sem orientação médica)${agenda ? " e ofereça marcar" : ""}.`),
      );
      if (agenda) esp.forEach((_, i) => liga(`esp_${i + 1}`, "agendar", "O paciente quer marcar"));
    }
    if (f.convenios) {
      novaFaixa("convenios", "Convênios");
      topico("convenios", "Convênios", "O paciente pergunta se atende convênio ou plano de saúde", ehNao(f.convenios) ? "A clínica atende só particular: diga isso com naturalidade e informe o valor da consulta particular." : `Convênios aceitos: ${f.convenios}. Se o do paciente não estiver na lista, ofereça o particular com o valor.`);
      add("conv_particular", "subagente", "Oferecer particular", "O convênio do paciente não é aceito: ofereça a consulta particular com o valor e as formas de pagamento.");
      liga("convenios", "conv_particular", "O convênio do paciente não é aceito");
      if (agenda) {
        liga("convenios", "agendar", "O convênio é aceito e o paciente quer marcar");
        liga("conv_particular", "agendar", "O paciente aceitou o particular e quer marcar");
      }
      liga("conv_particular", FECH, "O paciente vai pensar");
    }
    novaFaixa("urgencia", "Urgência");
    add("urg_orienta", "falar", "Orientar emergência", "Se for uma emergência, ligue agora para o SAMU, no 192, ou vá ao pronto-socorro mais próximo.");
    for (const r of recepcoes) liga(r, "urg_orienta", "O paciente descreve emergência ou sintoma grave (dor forte, sangramento, falta de ar, desmaio)");
    add("urg_estado", "atualizar_estado", "Marcar urgência", "urgencia=alta");
    liga("urg_orienta", "urg_estado");
    add("urg_repasse", "acao", "Avisar a equipe", "repassar_para_equipe");
    liga("urg_estado", "urg_repasse");
    liga("urg_repasse", FECH, "sucesso");
    liga("urg_repasse", FECH, "falha");
    if (f.retorno && !ehNao(f.retorno) && agenda) {
      novaFaixa("retorno", "Retorno");
      topico("retorno", "Retorno", "O paciente quer marcar retorno", `Regra de retorno: ${f.retorno}. Confirme a data da última consulta antes.`);
      liga("retorno", "meus_buscar", "Você precisa achar a última consulta");
      liga("retorno", "agendar", "O retorno está dentro da regra e o paciente quer marcar");
    }
    if (f.receitas) {
      novaFaixa("receitas", "Receitas e exames");
      topico("receitas", "Receita, atestado ou exame", "O paciente pede receita, atestado, laudo ou resultado de exame", `Nunca fale de diagnóstico. Regra da clínica: ${f.receitas}. Anote nome completo, data de nascimento e o que precisa.`);
      repasse("rec_repasse", "receitas", "Você já anotou o pedido", "Anotei! A equipe clínica cuida disso e te retorna.");
    }
  }

  /* ───────── nicho: restaurante ───────── */
  if (cat === "restaurante") {
    novaFaixa("cardapio", "Cardápio");
    topico("cardapio", "Cardápio e pratos", "O cliente pergunta do cardápio, pratos ou preços", "Responda com o cardápio (consulte se precisar) e sugira um carro-chefe.");
    liga("cardapio", "duvidas_consulta", "Você não sabe o detalhe do prato");
    if (f.alergias) {
      add("alergia", "subagente", "Alergias e restrições", `Regra da casa: ${f.alergias}. Nunca garanta ausência de alérgenos sem confirmar.`);
      liga("cardapio", "alergia", "O cliente tem alergia ou restrição alimentar");
      for (const r of recepcoes) liga(r, "alergia", "O cliente pergunta sobre alergia, glúten, lactose ou restrição");
      liga("alergia", FECH, "A dúvida foi respondida");
      repasse("alergia_rep", "alergia", "Precisa confirmar com a cozinha", "Vou confirmar com a cozinha e te retornamos rapidinho.");
    }
    if (f.delivery && !ehNao(f.delivery)) {
      novaFaixa("delivery", "Delivery");
      topico("delivery", "Delivery e retirada", "O cliente quer pedir para entregar ou retirar", `Como funciona: ${f.delivery}. Explique em uma frase e ofereça mandar o link pelo WhatsApp.`);
      add("deliv_link", "acao", "Mandar link no WhatsApp", "enviar_whatsapp");
      liga("delivery", "deliv_link", "O cliente quer o link");
      liga("deliv_link", FECH, "sucesso");
      liga("deliv_link", FECH, "falha");
    }
    if (f.eventos && !/nao faz/i.test(f.eventos)) {
      novaFaixa("eventos", "Eventos");
      topico("eventos", "Grupos e eventos", "O cliente quer fazer um evento ou reservar para um grupo grande", `Regra da casa: ${f.eventos}.`);
      if (agenda) liga("agendar", "eventos", `O grupo passa de ${f.reserva_max && !ehNao(f.reserva_max) ? f.reserva_max : "10"} pessoas`);
      add("ev_detalhes", "subagente", "Detalhes do evento", "Pergunte, um de cada vez: data, número de pessoas e tipo de evento.");
      liga("eventos", "ev_detalhes", "O cliente quer orçamento");
      repasse("ev_repasse", "ev_detalhes", "Você já tem data, pessoas e tipo", "Anotei tudo! O responsável por eventos te liga com o orçamento.");
    }
  }

  /* ───────── nicho: outros serviços ───────── */
  if (cat === "servicos") {
    if (f.orcamento) {
      novaFaixa("orcamento", "Orçamento");
      topico("orcamento", "Orçamento", "O cliente quer um orçamento", f.orcamento === "telefone" ? "Use a tabela de preços para passar o orçamento; se faltar informação, pergunte uma coisa por vez." : "O orçamento precisa de avaliação: explique isso em uma frase e ofereça marcar a avaliação.");
      add("orc_tabela", "acao", "Consultar tabela", "consultar_conhecimento", LARGURA * 0.3);
      add("orc_responder", "subagente", "Passar o orçamento", "Passe o valor com o que voltou da consulta, deixando claro o que está incluso.", LARGURA * 0.3);
      liga("orcamento", "orc_tabela", "Você já sabe o que o cliente precisa");
      liga("orc_tabela", "orc_responder", "sucesso");
      liga("orc_responder", FECH, "O cliente recebeu o orçamento");
      if (agenda) {
        liga("orcamento", "agendar", "O cliente quer marcar a avaliação ou o serviço");
        liga("orc_responder", "agendar", "O cliente quer fechar e marcar");
      }
      repasse("orc_repasse", "orcamento", "O orçamento depende da equipe", "Anotei os detalhes e a equipe te retorna com o orçamento.");
      liga("orc_tabela", "orc_repasse", "falha");
    }
    if (f.atende_local) {
      novaFaixa("area", "Área de atendimento");
      topico("area", "Área de atendimento", "O cliente pergunta se atendem na região dele ou onde fica a empresa", `Como funciona: ${f.atende_local}. Se for fora da área, avise com jeitinho.`);
      repasse("area_rep", "area", "O cliente está fora da área e quer deixar o contato", "Anotei! Se a gente passar a atender aí, te avisamos.");
    }
    if (f.urgencia_srv && !ehNao(f.urgencia_srv)) {
      novaFaixa("urgencia_srv", "Urgência");
      topico("urgencia_srv", "Urgência", "O cliente tem uma urgência", `Regra de urgência: ${f.urgencia_srv}. Colete onde está e o contato, um por vez.`);
      add("urg_srv_cond", "condicao", "Dentro do horário?");
      liga("urgencia_srv", "urg_srv_cond", "Você já tem local e contato");
      const num = temNumero(f.plantao_numero) ? f.plantao_numero! : temNumero(f.transferir_numero) ? f.transferir_numero! : "";
      if (num) {
        add("urg_srv_transf", "transferir", "Transferir urgência", num);
        liga("urg_srv_cond", "urg_srv_transf", "dentro_do_horario = sim");
      }
      repasse("urg_srv_rep", "urg_srv_cond", "", "Registrei como urgente e já avisei a equipe.");
    }
    if (f.garantia && !ehNao(f.garantia)) {
      novaFaixa("garantia", "Garantia");
      topico("garantia", "Garantia e pós-venda", "O cliente fala de garantia, defeito ou retrabalho", `Regra: ${f.garantia}. Acolha, pergunte quando o serviço foi feito e o que aconteceu. Não prometa nada fora da regra.`);
      repasse("gar_rep", "garantia", "Você já entendeu o caso", "Registrei com prioridade e a equipe te liga pra resolver.");
    }
  }

  /* ───────── sistemas da empresa ───────── */
  if (f.sistemas && !ehNao(f.sistemas)) {
    novaFaixa("cadastro", "Cadastro do cliente");
    topico("cadastro", "Consultar cadastro", `O cliente pergunta sobre algo do cadastro dele (${f.sistemas})`, "Peça o dado que identifica o cliente (CPF, telefone ou nome), um por vez.");
    add("cad_consulta", "acao", "Consultar cadastro", "consultar_cadastro_cliente");
    add("cad_resposta", "subagente", "Responder com o cadastro", "Responda só com o que voltou da consulta.");
    add("cad_nao_achou", "subagente", "Cadastro não encontrado", "Peça para conferir o dado uma vez.");
    liga("cadastro", "cad_consulta", "Você já tem o dado do cliente");
    liga("cad_consulta", "cad_resposta", "sucesso");
    liga("cad_consulta", "cad_nao_achou", "falha");
    liga("cad_resposta", FECH, "O cliente foi atendido");
    liga("cad_nao_achou", "cad_consulta", "O cliente passou outro dado");
    repasse("cad_rep", "cad_nao_achou", "Continuou sem encontrar", "Anotei e a equipe confere pra você.");
  }

  /* ───────── negociação ───────── */
  if (f.desconto) {
    novaFaixa("negociacao", "Negociação");
    topico("negociacao", "Pedido de desconto", "O cliente pede desconto ou quer negociar o preço", ehNao(f.desconto) ? "A empresa não dá desconto pelo telefone: diga com simpatia, destaque o valor do serviço e ofereça passar para a equipe se ele insistir." : `Limite que você pode oferecer: ${f.desconto}. Nunca passe disso.`);
    repasse("neg_rep", "negociacao", "O cliente quer mais do que você pode oferecer", "Vou levar seu pedido pra equipe e eles te retornam com uma proposta.");
    if (agenda) liga("negociacao", "agendar", "O cliente aceitou a condição e quer marcar");
  }

  /* ───────── falar com alguém ───────── */
  if (f.pessoa) {
    novaFaixa("pessoa", "Falar com alguém");
    add("pessoa_cond", "condicao", "Dá para transferir?");
    for (const r of recepcoes) liga(r, "pessoa_cond", "O cliente pede para falar com uma pessoa, com o dono ou com alguém específico");
    if (f.pessoa === "transferir" && temNumero(f.transferir_numero)) {
      add("pessoa_aviso", "falar", "Avisar a transferência", "Claro! Vou te transferir agora, só um instante.", -LARGURA * 0.3);
      add("pessoa_transferir", "transferir", "Transferir", f.transferir_numero!, -LARGURA * 0.3);
      liga("pessoa_cond", "pessoa_aviso", "dentro_do_horario = sim");
      liga("pessoa_aviso", "pessoa_transferir");
    }
    add("pessoa_recado", "subagente", "Anotar para a equipe", `Diga que vai passar o pedido para a equipe e quando ela retorna (${volta}). Entenda o motivo e confirme nome e telefone, um de cada vez.`, LARGURA * 0.3);
    liga("pessoa_cond", "pessoa_recado", "");
    repasse("pessoa_rep", "pessoa_recado", "Você já sabe o motivo e o contato", `Pronto! Passei seu recado e a equipe te retorna ${volta}.`);
  }

  /* ───────── fora do horário ───────── */
  if (f.fora && f.horario) {
    novaFaixa("fora", "Fora do horário");
    if (f.fora === "plantao") {
      topico("fora_triagem", "Triagem de urgência", "É uma urgência fora do horário", "Entenda se é urgente de verdade e colete o contato.", { de: [RECEP_FORA] });
      if (temNumero(f.plantao_numero)) {
        add("fora_plantao", "transferir", "Transferir ao plantão", f.plantao_numero!);
        liga("fora_triagem", "fora_plantao", "É urgente e você já tem o contato");
      } else repasse("fora_urg_rep", "fora_triagem", "É urgente e você já tem o contato", "Registrei como urgente e avisei o plantão.");
    }
    topico("fora_recado", "Recado fora do horário", "O cliente quer deixar um recado ou precisa de alguém da equipe", `Anote o pedido completo e diga que a equipe volta ${volta}.`, { de: [RECEP_FORA] });
    repasse("fora_rep", "fora_recado", "Você já tem o pedido e o contato", `Anotado! A equipe volta ${volta} e te retorna logo cedo.`);
    if (f.fora === "plantao") liga("fora_triagem", "fora_recado", "Não é urgente");
  }

  /* ───────── reclamação ───────── */
  if (f.reclamacao) {
    novaFaixa("reclamacao", "Reclamações");
    topico("reclamacao", "Acolher reclamação", "O cliente está insatisfeito, reclama ou relata um problema", "Acolha com calma e empatia, peça desculpas pelo transtorno sem culpar ninguém e deixe o cliente falar.");
    add("rec_entender", "subagente", "Entender o problema", "Entenda o que aconteceu, quando e o que o cliente espera, uma pergunta por vez. Não prometa reembolso nem desconto.");
    add("rec_urgencia", "atualizar_estado", "Urgência alta", "urgencia=alta");
    liga("reclamacao", "rec_entender", "O cliente já desabafou");
    liga("rec_entender", "rec_urgencia", "Você entendeu o problema e o que o cliente espera");
    add("rec_repasse", "acao", "Registrar reclamação", "repassar_para_equipe");
    add("rec_ok", "falar", "Prazo de retorno", `Registrei com prioridade. ${/^(eu|o |a )/i.test(f.reclamacao) || f.reclamacao.length > 6 ? `Quem cuida disso: ${f.reclamacao.replace(/\.$/, "")}.` : quandoVolta}`);
    add("rec_erro", "falar", "Anotado mesmo assim", "Anotei tudo aqui e a equipe vai te retornar com prioridade.");
    liga("rec_urgencia", "rec_repasse");
    liga("rec_repasse", "rec_ok", "sucesso");
    liga("rec_repasse", "rec_erro", "falha");
    liga("rec_ok", FECH);
    liga("rec_erro", FECH);
  }

  /* ───────── regras livres do dono ───────── */
  if (p.regras.length) {
    novaFaixa("regras", "Regras da empresa");
    p.regras.slice(0, 5).forEach((r, i) => {
      const id = `regra_${i + 1}`;
      topico(id, `Quando ${r.quando}`.slice(0, 60), r.quando, `Regra definida pelo dono: quando ${r.quando}, ${r.fazer}.`);
      if (/transf/i.test(r.fazer) && temNumero(f.transferir_numero)) {
        add(`${id}_transf`, "transferir", "Transferir", f.transferir_numero!);
        liga(id, `${id}_transf`, "A situação foi confirmada");
      } else if (/pass|repass|encaminh|avis|chama|anot|financeiro|gerente|equipe|dono/i.test(r.fazer)) {
        repasse(`${id}_rep`, id, "A situação foi confirmada", "Combinado, já passei pra pessoa certa e ela te retorna.");
      }
    });
  }

  /* ───────── fechamento ───────── */
  novaFaixa("fechamento", "Fechamento", undefined);
  add(FECH, "subagente", "Mais alguma coisa?", `Confirme o que foi feito em uma frase e pergunte se pode ajudar em mais alguma coisa. Se não, despeça-se usando o nome do cliente (se souber).`);
  add("satisfacao", "atualizar_estado", "Atendimento resolvido", "resultado=resolvido");
  add("fim", "fim", "Fim");
  liga(FECH, RECEP, "O cliente tem outro assunto");
  liga(FECH, "satisfacao", "O cliente não precisa de mais nada e você já se despediu");
  liga("satisfacao", "fim");
  for (const r of recepcoes) liga(r, FECH, "O cliente só queria uma informação rápida que você já respondeu");
  if (recepcoes.includes(RECEP_FORA)) liga(FECH, RECEP_FORA, "O cliente tem outro assunto e a empresa está fechada");

  // the entry block sits centered above the lanes; closing goes below the tallest lane
  const faixas = secoes.filter((s) => s.y === TOPO_FAIXAS && s.id !== "fechamento");
  const centro = ((faixas.length - 1) * LARGURA) / 2;
  const fundo = Math.max(TOPO_FAIXAS + 200, ...nos.filter((n) => faixas.some((s) => s.nos.includes(n.id))).map((n) => n.y)) + 220;
  const ent = secoes.find((s) => s.id === "entrada")!;
  for (const n of nos.filter((x) => ent.nos.includes(x.id))) n.x += centro;
  ent.x = centro;
  const fec = secoes.find((s) => s.id === "fechamento")!;
  const dxF = centro - fec.x;
  let yF = fundo;
  for (const n of nos.filter((x) => fec.nos.includes(x.id))) {
    n.x += dxF;
    n.y = yF;
    yF += PASSO_Y;
  }
  fec.x = centro;
  fec.y = fundo - 40;

  // drop dangling edges (e.g. a lane that wasn't built) so the flow always validates
  const ids = new Set(nos.map((n) => n.id));
  const validas = arestas.filter((a) => ids.has(a.de) && ids.has(a.para));
  return { workflow: { ativo: true, nos, arestas: validas }, secoes };
}

function proximaAbertura(semana: { aberto: boolean; inicio: string }[]): string {
  const abertos = semana.map((d, i) => (d.aberto ? i : -1)).filter((i) => i >= 0);
  if (abertos.length === 7) return "logo cedo";
  if (!abertos.length) return "no próximo dia útil";
  const ini = semana[abertos[0]]?.inicio ?? "08:00";
  return `no próximo dia útil a partir das ${ini.replace(":00", "h")}`;
}
