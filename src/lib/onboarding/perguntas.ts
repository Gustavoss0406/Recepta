import { brl, ehNao, ehSim, lerHorario, norm, telefone, valorEmReais, type Categoria, type Perfil } from "./perfil";

export type Camada = "base" | "dinamica" | "avancada";

export interface Pergunta {
  id: string;
  camada: Camada;
  /** The question is answered once its first key is filled (or it was skipped). */
  chaves: string[];
  categoria?: Categoria;
  texto: (p: Perfil) => string;
  /** Shown when the owner asks "como assim?". */
  ajuda: string;
  chips: (p: Perfil) => string[];
  quando?: (p: Perfil) => boolean;
  /** Local (model-free) understanding of the answer. */
  extrair: (t: string, p: Perfil) => Record<string, string | undefined>;
  /** Value used when the owner skips. */
  padrao: (p: Perfil) => Record<string, string>;
}

const c = (p: Perfil, k: string) => p.campos[k] ?? "";
const simNao = (k: string) => (t: string) => (ehNao(t) ? { [k]: "nao" } : ehSim(t) ? { [k]: "sim" } : { [k]: t.trim().slice(0, 300) });
const texto = (k: string) => (t: string) => (ehNao(t) ? { [k]: "nao" } : { [k]: t.trim().slice(0, 400) });
const tipoNegocio = (p: Perfil) => {
  switch (c(p, "categoria")) {
    case "imobiliaria":
      return { coisa: "imóvel", marcar: "visita", cliente: "cliente" };
    case "clinica":
      return { coisa: "atendimento", marcar: "consulta", cliente: "paciente" };
    case "restaurante":
      return { coisa: "prato", marcar: "reserva", cliente: "cliente" };
    default:
      return { coisa: "serviço", marcar: "horário", cliente: "cliente" };
  }
};

const CATEGORIAS: [Categoria, RegExp][] = [
  ["imobiliaria", /imobil|imove|corret|aluguel|locacao|condominio|loteamento|incorporad/],
  ["clinica", /clinic|consultori|odonto|dentist|medic|saude|estetic|fisio|psicolog|nutri|laborator|exame|derma|pediatr|veterin|vet\b|hospital|terapia/],
  ["restaurante", /restaur|pizz|lanch|hamburg|bar\b|cafe|padaria|confeit|delivery|comida|sushi|churrasc|buffet|marmit/],
];

export function categoriaDe(t: string): Categoria {
  const s = norm(t);
  return CATEGORIAS.find(([, r]) => r.test(s))?.[0] ?? "servicos";
}

export const PERGUNTAS: Pergunta[] = [
  /* ───────── base ───────── */
  {
    id: "negocio",
    camada: "base",
    chaves: ["segmento", "categoria"],
    texto: () => "Pra começar: me conta, qual é o seu negócio?",
    ajuda: "Só o ramo mesmo, tipo 'imobiliária', 'clínica odontológica', 'pizzaria', 'oficina'. Com isso eu já sei que caminhos montar.",
    chips: () => ["Imobiliária", "Clínica", "Restaurante", "Oficina mecânica", "Pet shop"],
    extrair: (t) => {
      const seg = t
        .replace(/^(eu\s+)?(tenho|sou|temos|trabalho com|é|e)\s+(uma?|um)?\s*/i, "")
        .replace(/[.!]+$/, "")
        .trim()
        .slice(0, 60);
      return { segmento: seg || t.slice(0, 60), categoria: categoriaDe(t) };
    },
    padrao: () => ({ segmento: "Serviços", categoria: "servicos" }),
  },
  {
    id: "empresa",
    camada: "base",
    chaves: ["empresa_nome", "cidade"],
    texto: () => "E como a empresa se chama? Fica em que cidade?",
    ajuda: "O nome entra na saudação da ligação (ex.: 'Imobiliária Lar, aqui é a Lia…'), e a cidade me ajuda com endereço e regiões.",
    chips: () => [],
    extrair: (t) => {
      const m = /^(.*?)(?:,|\s+em\s+|\s+de\s+(?=[A-ZÁÉÍÓÚ][a-z]+$)|\s+-\s+|\s+fica\s+(?:em|no|na)\s+)(.+)$/i.exec(t.trim());
      const limpa = (x: string) => x.replace(/^(a|o|se chama|chama|é|e|nome é|o nome é)\s+/i, "").replace(/[.!]+$/, "").trim();
      return m ? { empresa_nome: limpa(m[1]).slice(0, 60), cidade: limpa(m[2]).replace(/^(em|no|na)\s+/i, "").slice(0, 60) } : { empresa_nome: limpa(t).slice(0, 60) };
    },
    padrao: () => ({ empresa_nome: "Minha empresa", cidade: "" }),
  },
  {
    id: "site",
    camada: "base",
    chaves: ["site"],
    texto: () => "Agora o pulo do gato: me passa o site e o Instagram de vocês (o que tiver) que eu analiso a empresa na hora e já monto o resto a partir disso.",
    ajuda: "Eu leio as páginas (serviços, preços, endereço, perguntas frequentes) e uso pra responder os clientes.",
    chips: () => ["Não temos site", "Só Instagram"],
    extrair: (t) => {
      const insta = /instagram\.com\/([\w.]{2,30})/i.exec(t)?.[1] ?? /(?:^|\s)@([\w.]{2,30})/.exec(t)?.[1];
      const sem = t.replace(/\S*instagram\.com\S*|(?:^|\s)@[\w.]+/gi, " ");
      const m = /((?:h?t+p+s?:?\/*)?(?:www\.)?[a-z0-9-]+(?:\s?\.[a-z0-9-]{2,})+(?:\/\S*)?)/i.exec(sem);
      return { site: m ? m[1].replace(/\s/g, "") : "nao", ...(insta ? { instagram: `@${insta.replace(/\.$/, "")}` } : {}) };
    },
    padrao: () => ({ site: "nao" }),
  },
  {
    id: "servicos",
    camada: "base",
    chaves: ["servicos"],
    texto: (p) =>
      c(p, "categoria") === "imobiliaria"
        ? "Que tipo de imóvel vocês mais trabalham? Apartamento, casa, comercial… se tiver faixa de preço, melhor ainda."
        : c(p, "categoria") === "restaurante"
          ? "Quais são os carros-chefe da casa? Se souber o preço médio, me fala também."
          : "O que vocês mais vendem ou atendem? Se tiver preço, já me passa que eu uso nas respostas.",
    ajuda: "Uma lista curta já resolve, tipo 'limpeza R$ 150; clareamento R$ 900'. Cada item vira um caminho de dúvida no fluxo.",
    chips: () => [],
    extrair: texto("servicos"),
    padrao: () => ({ servicos: "nao" }),
  },
  {
    id: "motivos",
    camada: "base",
    chaves: ["motivos"],
    texto: () => "Quando o telefone toca aí, quais são os motivos mais comuns?",
    ajuda: "Pensa nas 3 ou 4 ligações que mais se repetem: preço, horário, marcar, reclamação, segunda via… Cada uma vira um caminho na triagem.",
    chips: (p) =>
      ({
        imobiliaria: ["Saber de imóvel", "Marcar visita", "Boleto do aluguel", "Anunciar imóvel"],
        clinica: ["Marcar consulta", "Preço", "Convênio", "Resultado de exame"],
        restaurante: ["Reserva", "Delivery", "Cardápio", "Eventos"],
        servicos: ["Orçamento", "Marcar horário", "Preço", "Garantia"],
      })[(c(p, "categoria") || "servicos") as Categoria],
    extrair: texto("motivos"),
    padrao: () => ({ motivos: "nao" }),
  },
  {
    id: "horario",
    camada: "base",
    chaves: ["horario"],
    texto: () => "E o horário de funcionamento, como é?",
    ajuda: "Algo como 'seg a sex das 8 às 18, sábado até meio-dia'. Com isso eu separo o que faço dentro e fora do horário.",
    chips: () => ["Seg a sex 8h às 18h", "Seg a sáb 9h às 19h", "Todos os dias", "24 horas"],
    extrair: (t) => ({ horario: t.trim().slice(0, 120) }),
    padrao: () => ({ horario: "seg a sex 8h às 18h" }),
  },
  {
    id: "agenda",
    camada: "base",
    chaves: ["agenda"],
    texto: (p) => `Vocês trabalham com ${tipoNegocio(p).marcar} marcada? Quer que eu já marque direto na agenda?`,
    ajuda: "Se sim, eu consulto os horários livres, ofereço duas opções e marco — na agenda da Recepta ou no seu Google Agenda.",
    chips: () => ["Sim, pode marcar", "Não marcamos"],
    extrair: (t) => ({ agenda: ehNao(t) || /nao marc|sem agend|ordem de chegada/.test(norm(t)) ? "nao" : "sim" }),
    padrao: () => ({ agenda: "sim" }),
  },
  {
    id: "fora",
    camada: "base",
    chaves: ["fora"],
    texto: () => "E quando vocês não estiverem atendendo, o que eu faço? Posso marcar mesmo assim, anotar e passar pra vocês de manhã, ou acionar um plantão.",
    ajuda: "É o que acontece de noite, fim de semana e feriado. Muita empresa perde cliente aí — eu posso resolver em vez de só dizer 'liga amanhã'.",
    chips: (p) => [...(c(p, "agenda") === "nao" ? [] : ["Marca mesmo assim"]), "Anota e me passa", "Tem plantão pra urgência"],
    extrair: (t) => {
      const s = norm(t);
      const tel = telefone(t);
      if (/plantao|urgen|emergen/.test(s) || tel) return { fora: "plantao", ...(tel ? { plantao_numero: tel } : {}) };
      if (/marc|agend|reserv/.test(s)) return { fora: "marcar" };
      return { fora: "recado" };
    },
    padrao: (p) => ({ fora: c(p, "agenda") === "nao" ? "recado" : "marcar" }),
  },
  {
    id: "plantao",
    camada: "base",
    chaves: ["plantao_numero"],
    quando: (p) => c(p, "fora") === "plantao",
    texto: () => "E qual o número do plantão pra eu transferir quando for urgente?",
    ajuda: "Pode ser um celular. Eu só transfiro quando for urgência de verdade; o resto eu anoto.",
    chips: () => ["Não tenho, só anota"],
    extrair: (t) => ({ plantao_numero: telefone(t) ?? "nao" }),
    padrao: () => ({ plantao_numero: "nao" }),
  },
  {
    id: "pessoa",
    camada: "base",
    chaves: ["pessoa"],
    texto: () => "Se o cliente pedir pra falar com alguém da equipe, eu transfiro a ligação ou anoto e passo o caso pra vocês?",
    ajuda: "Transferir é na hora (dentro do horário). Anotar é eu fazer um relatório certinho e vocês retornarem.",
    chips: () => ["Transfere", "Anota e passa"],
    extrair: (t) => {
      const tel = telefone(t);
      const s = norm(t);
      if (tel || /transfer|passa (a|pra) ligac|liga(r)? pra/.test(s)) return { pessoa: "transferir", ...(tel ? { transferir_numero: tel } : {}) };
      return { pessoa: "recado" };
    },
    padrao: () => ({ pessoa: "recado" }),
  },
  {
    id: "transferir",
    camada: "base",
    chaves: ["transferir_numero"],
    quando: (p) => c(p, "pessoa") === "transferir",
    texto: () => "Pra qual número eu transfiro?",
    ajuda: "O número que atende dentro do horário. Fora do horário eu anoto e passo o caso.",
    chips: () => ["Depois eu configuro"],
    extrair: (t) => ({ transferir_numero: telefone(t) ?? "nao" }),
    padrao: () => ({ transferir_numero: "nao" }),
  },
  {
    id: "recepcionista",
    camada: "base",
    chaves: ["recep_nome", "tom"],
    texto: () => "Agora sobre mim: como você quer que eu me chame nas ligações? E prefere um jeito mais formal ou mais descontraído?",
    ajuda: "Ex.: 'Lia, descontraída'. Eu sempre aviso que sou a recepcionista virtual e que a ligação é gravada.",
    chips: () => ["Lia, descontraída", "Clara, equilibrada", "Helena, formal"],
    extrair: (t) => {
      const s = norm(t);
      const tom = /formal|seri/.test(s) && !/informal|descontra/.test(s) ? "formal" : /descontra|informal|leve|alegre|simpat/.test(s) ? "descontraido" : "equilibrado";
      const nome = /\b([A-ZÁÉÍÓÚ][a-záéíóúãõç]{2,14})\b/.exec(t.replace(/^(Pode|Quero|Prefiro|Mais|Me|Eu|Se|Chama|Formal|Descontra\w*|Equilibrad\w*)\b/g, ""))?.[1];
      return { ...(nome ? { recep_nome: nome } : {}), tom };
    },
    padrao: () => ({ recep_nome: "Lia", tom: "equilibrado" }),
  },

  /* ───────── dinâmicas: imobiliária ───────── */
  {
    id: "imob_operacao",
    camada: "dinamica",
    categoria: "imobiliaria",
    chaves: ["operacao"],
    texto: () => "Vocês trabalham com venda, aluguel ou os dois?",
    ajuda: "Compra e locação têm perguntas bem diferentes (financiamento x fiador), então cada uma ganha seu caminho.",
    chips: () => ["Os dois", "Só venda", "Só aluguel"],
    extrair: (t) => {
      const s = norm(t);
      const v = /venda|compra|vend/.test(s);
      const l = /alug|loca/.test(s);
      return { operacao: (v && l) || /dois|ambos|tudo/.test(s) ? "ambos" : l ? "locacao" : "venda" };
    },
    padrao: () => ({ operacao: "ambos" }),
  },
  {
    id: "imob_regioes",
    camada: "dinamica",
    categoria: "imobiliaria",
    chaves: ["regioes"],
    texto: (p) => `Quais bairros ou regiões vocês atendem${c(p, "cidade") ? ` em ${c(p, "cidade")}` : ""}?`,
    ajuda: "Se alguém procurar fora da região, eu aviso com jeitinho e anoto o contato em vez de perder o cliente.",
    chips: () => ["A cidade toda"],
    extrair: texto("regioes"),
    padrao: () => ({ regioes: "nao" }),
  },
  {
    id: "imob_alto_padrao",
    camada: "dinamica",
    categoria: "imobiliaria",
    chaves: ["alto_valor", "alto_acao"],
    texto: () => "E quando o imóvel for caro demais — alto padrão — o que eu faço? A partir de quanto você considera alto padrão?",
    ajuda: "Ex.: 'acima de 2 milhões passa pro corretor sênior'. Eu crio um caminho só pra esse cliente, com qualificação mais cuidadosa.",
    chips: () => ["Acima de 1 mi, passa pro corretor sênior", "Acima de 3 mi, só com o gerente", "Trata igual"],
    extrair: (t) => {
      if (/igual|normal|nao muda|tanto faz/.test(norm(t))) return { alto_valor: "nao", alto_acao: "nao" };
      const v = valorEmReais(t);
      const acao = t.replace(/^.*?(passa|transfer|encaminh|chama|so com|só com|liga|manda)/i, "$1").trim();
      return { ...(v ? { alto_valor: String(v) } : {}), alto_acao: acao.length > 4 ? acao.slice(0, 200) : "passar para o corretor sênior" };
    },
    padrao: () => ({ alto_valor: "nao", alto_acao: "nao" }),
  },
  {
    id: "imob_financiamento",
    camada: "dinamica",
    categoria: "imobiliaria",
    chaves: ["financiamento"],
    quando: (p) => c(p, "operacao") !== "locacao",
    texto: () => "Se perguntarem de financiamento ou FGTS, eu explico o básico ou já passo pra alguém de vocês?",
    ajuda: "Eu posso explicar o geral (entrada, FGTS, simulação no banco) e anotar a renda pra um correspondente retornar.",
    chips: () => ["Explica o básico", "Passa pro correspondente"],
    extrair: (t) => ({ financiamento: /passa|correspond|repass|equipe|alguem|alguém/.test(norm(t)) ? "repassa" : "explica" }),
    padrao: () => ({ financiamento: "explica" }),
  },
  {
    id: "imob_visita",
    camada: "dinamica",
    categoria: "imobiliaria",
    chaves: ["visita_requisitos"],
    quando: (p) => c(p, "agenda") !== "nao",
    texto: () => "Pra visitar um imóvel, precisa de alguma coisa? Documento, ir com o corretor, pegar chave…",
    ajuda: "Eu aviso o cliente antes de confirmar, pra ninguém chegar no imóvel e dar com a porta fechada.",
    chips: () => ["Só ir com o corretor", "Levar documento com foto", "Nada"],
    extrair: texto("visita_requisitos"),
    padrao: () => ({ visita_requisitos: "nao" }),
  },
  {
    id: "imob_captacao",
    camada: "dinamica",
    categoria: "imobiliaria",
    chaves: ["captacao"],
    texto: () => "E quando ligar um proprietário querendo anunciar o imóvel com vocês?",
    ajuda: "Eu pego os dados do imóvel (tipo, bairro, valor pretendido) e passo pra captação já com o relatório pronto.",
    chips: () => ["Quero esses contatos!", "Não captamos"],
    extrair: (t) => ({ captacao: ehNao(t) || /nao capt/.test(norm(t)) ? "nao" : "sim" }),
    padrao: () => ({ captacao: "sim" }),
  },
  {
    id: "imob_inquilino",
    camada: "dinamica",
    categoria: "imobiliaria",
    chaves: ["inquilino"],
    quando: (p) => c(p, "operacao") !== "venda",
    texto: () => "E inquilino ligando com problema — vazamento, boleto, manutenção — como funciona aí?",
    ajuda: "Eu separo o urgente (vazamento, sem luz) do resto (segunda via, dúvida de reajuste) e passo cada um do jeito certo.",
    chips: () => ["Urgência passa na hora", "Anota tudo e passa"],
    extrair: texto("inquilino"),
    padrao: () => ({ inquilino: "anotar e passar; urgências com prioridade" }),
  },

  /* ───────── dinâmicas: clínica ───────── */
  {
    id: "cli_especialidades",
    camada: "dinamica",
    categoria: "clinica",
    chaves: ["especialidades"],
    texto: () => "Quais especialidades ou profissionais atendem aí?",
    ajuda: "Cada especialidade ganha seu caminho de dúvida e agendamento.",
    chips: () => [],
    extrair: texto("especialidades"),
    padrao: () => ({ especialidades: "nao" }),
  },
  {
    id: "cli_convenios",
    camada: "dinamica",
    categoria: "clinica",
    chaves: ["convenios"],
    texto: () => "Atendem convênio? Quais?",
    ajuda: "Se o convênio não for aceito, eu ofereço o particular com o valor em vez de só dizer 'não atendemos'.",
    chips: () => ["Só particular"],
    extrair: (t) => (/particular|nao atend|nenhum/.test(norm(t)) ? { convenios: "nao" } : { convenios: t.trim().slice(0, 300) }),
    padrao: () => ({ convenios: "nao" }),
  },
  {
    id: "cli_urgencia",
    camada: "dinamica",
    categoria: "clinica",
    chaves: ["urgencia_orientacao"],
    texto: () => "Se alguém ligar com dor forte ou sintoma grave, o que eu falo? Eu nunca dou orientação médica, tá?",
    ajuda: "O padrão é orientar o SAMU (192) ou pronto-socorro e avisar a equipe na hora.",
    chips: () => ["Orienta o 192 e me avisa", "Encaixa no mesmo dia"],
    extrair: texto("urgencia_orientacao"),
    padrao: () => ({ urgencia_orientacao: "orientar SAMU 192 ou pronto-socorro e avisar a equipe" }),
  },
  {
    id: "cli_retorno",
    camada: "dinamica",
    categoria: "clinica",
    chaves: ["retorno"],
    quando: (p) => c(p, "agenda") !== "nao",
    texto: () => "Retorno tem alguma regra? Tipo prazo ou valor diferente?",
    ajuda: "Ex.: 'retorno grátis em até 30 dias'. Eu confiro na agenda e marco como retorno.",
    chips: () => ["Grátis em até 30 dias", "Cobra normal"],
    extrair: texto("retorno"),
    padrao: () => ({ retorno: "nao" }),
  },
  {
    id: "cli_receitas",
    camada: "dinamica",
    categoria: "clinica",
    chaves: ["receitas"],
    texto: () => "E pedido de receita, atestado ou resultado de exame, como fica?",
    ajuda: "Eu anoto certinho (nome, o que precisa) e passo pra equipe — sem falar nada de diagnóstico.",
    chips: () => ["Anota e passa", "Resultado sai pelo site"],
    extrair: texto("receitas"),
    padrao: () => ({ receitas: "anotar e passar para a equipe" }),
  },

  /* ───────── dinâmicas: restaurante ───────── */
  {
    id: "rest_reserva",
    camada: "dinamica",
    categoria: "restaurante",
    chaves: ["reserva_max"],
    texto: () => "Aceitam reserva? Até quantas pessoas, e qual a tolerância de atraso?",
    ajuda: "Acima do limite eu trato como evento. A tolerância eu aviso na confirmação.",
    chips: () => ["Até 10 pessoas, 15 min", "Não fazemos reserva"],
    extrair: (t) => {
      if (/nao (fazemos|aceit|tem)|sem reserva/.test(norm(t)) || ehNao(t)) return { reserva_max: "nao" };
      const nums = [...t.matchAll(/\d+/g)].map((m) => m[0]);
      return { reserva_max: nums[0] ?? "10", ...(nums[1] ? { tolerancia: nums[1] } : {}) };
    },
    padrao: () => ({ reserva_max: "10" }),
  },
  {
    id: "rest_delivery",
    camada: "dinamica",
    categoria: "restaurante",
    chaves: ["delivery"],
    texto: () => "Fazem delivery ou retirada? Por onde o cliente pede?",
    ajuda: "Eu explico como pedir e mando o link pelo WhatsApp se precisar.",
    chips: () => ["Pelo iFood", "WhatsApp", "Não fazemos"],
    extrair: texto("delivery"),
    padrao: () => ({ delivery: "nao" }),
  },
  {
    id: "rest_eventos",
    camada: "dinamica",
    categoria: "restaurante",
    chaves: ["eventos"],
    texto: () => "E grupo grande ou evento — aniversário, empresa? Como vocês tratam?",
    ajuda: "Eu pego data, número de pessoas e o tipo de evento e passo pro responsável fazer o orçamento.",
    chips: () => ["Passa pro gerente", "Não fazemos eventos"],
    extrair: texto("eventos"),
    padrao: () => ({ eventos: "passar para o gerente com data e número de pessoas" }),
  },
  {
    id: "rest_alergias",
    camada: "dinamica",
    categoria: "restaurante",
    chaves: ["alergias"],
    texto: () => "Se perguntarem de alergia ou restrição (glúten, lactose), eu respondo ou consulto a cozinha?",
    ajuda: "Por segurança, o padrão é não garantir nada sem confirmar com a cozinha.",
    chips: () => ["Consulta a cozinha", "Responde pelo cardápio"],
    extrair: texto("alergias"),
    padrao: () => ({ alergias: "consultar a cozinha antes de garantir" }),
  },

  /* ───────── dinâmicas: outros serviços ───────── */
  {
    id: "srv_orcamento",
    camada: "dinamica",
    categoria: "servicos",
    chaves: ["orcamento"],
    texto: () => "Vocês passam orçamento por telefone ou precisa ver antes?",
    ajuda: "Se precisar ver, eu marco a avaliação; se der por telefone, eu uso a tabela de preços.",
    chips: () => ["Precisa ver antes", "Dá por telefone"],
    extrair: (t) => ({ orcamento: /telefone|tabela|da sim|dá sim|passa/.test(norm(t)) && !/precisa|ver antes|visita|avali/.test(norm(t)) ? "telefone" : "visita" }),
    padrao: () => ({ orcamento: "visita" }),
  },
  {
    id: "srv_local",
    camada: "dinamica",
    categoria: "servicos",
    chaves: ["atende_local"],
    texto: () => "Vocês vão até o cliente ou ele vem até vocês? Até onde atendem?",
    ajuda: "Se for fora da área, eu aviso e anoto em vez de marcar à toa.",
    chips: () => ["Cliente vem até nós", "Vamos até o cliente"],
    extrair: texto("atende_local"),
    padrao: () => ({ atende_local: "o cliente vem até a empresa" }),
  },
  {
    id: "srv_urgencia",
    camada: "dinamica",
    categoria: "servicos",
    chaves: ["urgencia_srv"],
    texto: (p) => `No ramo de ${c(p, "segmento").toLowerCase() || "vocês"}, existe situação urgente? O que eu faço quando for?`,
    ajuda: "Ex.: carro quebrado na estrada, pet passando mal, vazamento. Urgência tem caminho próprio e prioridade.",
    chips: () => ["Não tem urgência", "Urgência passa na hora"],
    extrair: texto("urgencia_srv"),
    padrao: () => ({ urgencia_srv: "nao" }),
  },
  {
    id: "srv_garantia",
    camada: "dinamica",
    categoria: "servicos",
    chaves: ["garantia"],
    texto: () => "E pós-venda — garantia, retrabalho — como funciona?",
    ajuda: "Eu confiro os dados do serviço e passo pra equipe com prioridade, sem prometer nada fora da regra.",
    chips: () => ["90 dias de garantia", "Anota e passa"],
    extrair: texto("garantia"),
    padrao: () => ({ garantia: "nao" }),
  },

  /* ───────── avançadas ───────── */
  {
    id: "vip",
    camada: "avancada",
    chaves: ["vip"],
    texto: () => "Agora uns detalhes mais finos. Tem cliente especial — recorrente, VIP — que merece um atendimento diferente?",
    ajuda: "Eu reconheço pelo número de telefone e trato pelo nome, com prioridade.",
    chips: () => ["Sim, prioridade total", "Trata todo mundo igual"],
    extrair: (t) => (/igual|nao|não tem/.test(norm(t)) && !/sim/.test(norm(t)) ? { vip: "nao" } : { vip: t.trim().slice(0, 300) }),
    padrao: () => ({ vip: "nao" }),
  },
  {
    id: "reclamacao",
    camada: "avancada",
    chaves: ["reclamacao"],
    texto: () => "Quando alguém liga reclamando, quem resolve aí? E em quanto tempo vocês costumam retornar?",
    ajuda: "Eu acolho, peço desculpas sem culpar ninguém e passo o caso com urgência — dizendo pro cliente quando vão retornar.",
    chips: () => ["Eu mesmo, no mesmo dia", "O gerente, em até 24h"],
    extrair: texto("reclamacao"),
    padrao: () => ({ reclamacao: "a equipe retorna no mesmo dia útil" }),
  },
  {
    id: "cancelamento",
    camada: "avancada",
    chaves: ["cancelamento"],
    quando: (p) => c(p, "agenda") !== "nao",
    texto: (p) => `Tem regra pra cancelar ou faltar ${tipoNegocio(p).marcar === "visita" ? "na visita" : "no horário"}?`,
    ajuda: "Ex.: 'cancelar com 24h de antecedência'. Antes de cancelar, eu sempre ofereço remarcar.",
    chips: () => ["24h de antecedência", "Sem regra"],
    extrair: texto("cancelamento"),
    padrao: () => ({ cancelamento: "nao" }),
  },
  {
    id: "desconto",
    camada: "avancada",
    chaves: ["desconto"],
    texto: () => "Posso negociar preço ou dar desconto? Se sim, até quanto?",
    ajuda: "Se não puder, eu nunca prometo desconto; se puder, eu sigo seu limite e passo o resto pra você.",
    chips: () => ["Não, nunca", "Até 10% à vista"],
    extrair: (t) => (ehNao(t) || /nunca/.test(norm(t)) ? { desconto: "nao" } : { desconto: t.trim().slice(0, 200) }),
    padrao: () => ({ desconto: "nao" }),
  },
  {
    id: "confirmacao",
    camada: "avancada",
    chaves: ["confirmacao"],
    quando: (p) => c(p, "agenda") !== "nao",
    texto: () => "Quer que eu mande a confirmação e um lembrete por WhatsApp depois de marcar?",
    ajuda: "Reduz bastante as faltas. Eu mando o resumo com dia, hora e endereço.",
    chips: () => ["Sim, manda", "Não precisa"],
    extrair: simNao("confirmacao"),
    padrao: () => ({ confirmacao: "sim" }),
  },
  {
    id: "sistemas",
    camada: "avancada",
    chaves: ["sistemas"],
    texto: () => "Vocês usam algum sistema ou CRM? Tipo Pipedrive, RD, Kommo, planilha…",
    ajuda: "Eu consigo consultar o cadastro do cliente e mandar cada atendimento pro seu CRM.",
    chips: () => ["Não usamos", "Planilha", "Pipedrive", "RD Station"],
    extrair: (t) => (ehNao(t) ? { sistemas: "nao" } : { sistemas: t.trim().slice(0, 120) }),
    padrao: () => ({ sistemas: "nao" }),
  },
  {
    id: "aviso",
    camada: "avancada",
    chaves: ["aviso"],
    texto: () => "Quando eu passar um caso pra você, prefere receber no WhatsApp ou no e-mail?",
    ajuda: "Vai um relatório curto: quem ligou, o que quer, urgência e o próximo passo.",
    chips: () => ["WhatsApp", "E-mail", "Os dois"],
    extrair: (t) => {
      const s = norm(t);
      return { aviso: /dois|ambos/.test(s) || (/whats|zap/.test(s) && /mail/.test(s)) ? "ambos" : /mail/.test(s) ? "email" : "whatsapp" };
    },
    padrao: () => ({ aviso: "ambos" }),
  },
  {
    id: "nunca",
    camada: "avancada",
    chaves: ["nunca"],
    texto: () => "Tem alguma coisa que eu nunca devo falar ou prometer?",
    ajuda: "Ex.: 'nunca falar de prazo de entrega', 'não comentar sobre concorrente'. Vira regra fixa.",
    chips: () => ["Nada específico"],
    extrair: (t) => (ehNao(t) || /nada/.test(norm(t)) ? { nunca: "nao" } : { nunca: t.trim().slice(0, 300) }),
    padrao: () => ({ nunca: "nao" }),
  },
  {
    id: "vendedores",
    camada: "avancada",
    chaves: ["vendedores"],
    texto: () => "E vendedor ou telemarketing ligando, eu dispenso com educação?",
    ajuda: "Eu agradeço, digo que não há interesse e encerro — sem ocupar sua equipe.",
    chips: () => ["Sim, dispensa", "Anota o contato"],
    extrair: (t) => ({ vendedores: /anota|passa|recado/.test(norm(t)) ? "nao" : ehNao(t) ? "nao" : "sim" }),
    padrao: () => ({ vendedores: "sim" }),
  },
  {
    id: "extra",
    camada: "avancada",
    chaves: ["extra_fim"],
    quando: (p) => p.regras.length < 3,
    texto: (p) =>
      p.regras.length
        ? "Mais alguma situação específica? Se não tiver, é só dizer que acabou."
        : "Última: tem alguma situação específica do seu dia a dia que eu deveria saber? Tipo 'quando acontecer X, faz Y'.",
    ajuda: "Ex.: 'quando cliente pedir desconto pra pagar à vista, passa pro financeiro'. Cada situação vira um caminho próprio no fluxo.",
    chips: () => ["Não, é isso", "Quando pedirem nota fiscal, passa pro financeiro"],
    extrair: (t) => {
      if (ehNao(t) || /^(e isso|só isso|so isso|acabou|nada mais|pode finalizar|finaliza)/.test(norm(t)) || /nao,? e isso/.test(norm(t))) return { extra_fim: "sim" };
      return {};
    },
    padrao: () => ({ extra_fim: "sim" }),
  },
];

const porId = new Map(PERGUNTAS.map((q) => [q.id, q]));
export const pergunta = (id: string) => porId.get(id);

export function respondida(q: Pergunta, p: Perfil) {
  return p.pulados.includes(q.id) || Boolean(p.campos[q.chaves[0]]);
}

/** Questions that apply to this business, in order (base → dinâmicas da categoria → avançadas). */
export function roteiro(p: Perfil): Pergunta[] {
  const cat = p.campos.categoria as Categoria | undefined;
  return PERGUNTAS.filter((q) => (!q.categoria || q.categoria === cat) && (q.camada === "base" || cat) && (!q.quando || q.quando(p) || respondida(q, p)));
}

export function proximaPergunta(p: Perfil): Pergunta | null {
  return roteiro(p).find((q) => !respondida(q, p)) ?? null;
}

export function progresso(p: Perfil) {
  const r = roteiro(p);
  const feitas = r.filter((q) => respondida(q, p)).length;
  const camada = proximaPergunta(p)?.camada ?? "fim";
  const baseOk = r.filter((q) => q.camada === "base").every((q) => respondida(q, p));
  return { feitas, total: r.length, camada, baseOk };
}

/** Merges new fields; a question's extra keys only fill what is still empty. */
export function aplicarCampos(p: Perfil, novos: Record<string, string | undefined>): Perfil {
  const campos = { ...p.campos };
  for (const [k, v] of Object.entries(novos)) if (typeof v === "string" && v.trim()) campos[k] = v.trim();
  if (campos.categoria && !["imobiliaria", "clinica", "restaurante", "servicos"].includes(campos.categoria)) campos.categoria = categoriaDe(campos.categoria);
  return { ...p, campos };
}

export function pular(p: Perfil, q: Pergunta): Perfil {
  const def = q.padrao(p);
  const campos = { ...p.campos };
  for (const [k, v] of Object.entries(def)) if (!campos[k]) campos[k] = v;
  return { ...p, campos, pulados: [...new Set([...p.pulados, q.id])] };
}

/** "quando X, faz Y" / "se X, Y" → a free rule. */
export function lerRegra(t: string): { quando: string; fazer: string } | null {
  const m = /^\s*(?:quando|se|caso|sempre que)\s+(.+?)(?:,\s*|\s+(?:então|entao|aí|ai|voce|você)\s+)(.+)$/i.exec(t.trim());
  if (!m) return null;
  return { quando: m[1].trim().slice(0, 150), fazer: m[2].replace(/[.!]+$/, "").trim().slice(0, 300) };
}

/** Short reaction used when the model is unavailable (keeps the tone informal). */
export function reacaoLocal(q: Pergunta, p: Perfil): string {
  const v = (k: string) => p.campos[k];
  switch (q.id) {
    case "negocio":
      return `${v("segmento") ? `[excited] ${v("segmento").replace(/^./, (x) => x.toUpperCase())}, que legal!` : "Que legal!"} Já tô montando a base do seu fluxo aqui do lado.`;
    case "empresa":
      return v("empresa_nome") ? `[warmly] Prazer, ${v("empresa_nome")}!` : "Anotado!";
    case "horario":
      return "Perfeito, já separei o que acontece dentro e fora desse horário.";
    case "imob_alto_padrao":
      return v("alto_valor") && v("alto_valor") !== "nao" ? `Fechado: acima de ${brl(Number(v("alto_valor")))} vira caminho de alto padrão.` : "Beleza, trato todo mundo igual.";
    case "recepcionista":
      return v("recep_nome") ? `[laughs softly] Adorei, pode me chamar de ${v("recep_nome")}!` : "Combinado!";
    default:
      return ["[excited] Show!", "Boa, anotado.", "[warmly] Perfeito.", "[thoughtful] Entendi!", "Fechado.", "[happy] Ótimo!"][Math.abs(hash(q.id)) % 6];
  }
}

const hash = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7);
