/**
 * Simulated owners going through the onboarding conversation with the real model interpreting
 * each answer. Writes one transcript per persona plus a summary to docs/onboarding/simulacoes/.
 *
 *   npx tsx --conditions=react-server --env-file-if-exists=.env.local scripts/simular-onboarding.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validarWorkflow, workflowSchema } from "@/lib/agent/workflow";
import { iniciar, pularPergunta, responder, type EstadoOnboarding } from "@/lib/onboarding/conversa";
import { configDoPerfil, nichoDoPerfil } from "@/lib/onboarding/config";
import { gerarFluxo } from "@/lib/onboarding/gerador";
import { agentConfigSchema } from "@/lib/agent/config";
import { getNicho } from "@/lib/niches";
import { paciencia } from "@/server/providers/llm-rotacao";
import { interpretar } from "@/server/onboarding/conversa";

type Persona = { nome: string; descricao: string; respostas: Record<string, string[]>; esperado: { categoria: string; minNos: number; perguntasProibidas?: string[] } };

const PERSONAS: Persona[] = [
  {
    nome: "imobiliaria-detalhista",
    descricao: "Dona de imobiliária que fala muito e dá informação de passagem (nome, cidade e horário na mesma frase).",
    respostas: {
      negocio: ["Tenho uma imobiliária em Campinas, a Lar Imóveis, abrimos de segunda a sexta das 9 às 18 e sábado até 13h"],
      empresa: ["Lar Imóveis, Campinas"],
      servicos: ["Apartamento de 2 e 3 quartos, casa em condomínio e sala comercial. Vai de 350 mil a uns 4 milhões"],
      motivos: ["Muita gente perguntando de imóvel do anúncio, querendo visitar, inquilino com boleto e proprietário querendo anunciar"],
      agenda: ["Sim, pode marcar as visitas"],
      fora: ["Marca mesmo assim, sem problema"],
      pessoa: ["Transfere pro fixo, (19) 3232-1000"],
      site: ["larimoveis.com.br"],
      recepcionista: ["Pode ser Lia, bem leve e simpática"],
      imob_operacao: ["Vendemos e alugamos"],
      imob_regioes: ["Cambuí, Taquaral, Nova Campinas e Barão Geraldo"],
      imob_alto_padrao: ["Acima de 2,5 milhões quero que passe pro Ricardo, nosso corretor sênior"],
      imob_financiamento: ["Pode explicar o básico, mas não promete nada"],
      imob_visita: ["Tem que ir com o corretor e levar documento"],
      imob_captacao: ["Claro, quero muito esses contatos"],
      imob_inquilino: ["Vazamento e falta de luz é urgente, passa na hora; boleto anota"],
      vip: ["Investidor que já comprou com a gente tem prioridade"],
      reclamacao: ["Eu mesma resolvo, retorno no mesmo dia"],
      cancelamento: ["Pede pra avisar 2 horas antes"],
      desconto: ["Não pode dar desconto"],
      confirmacao: ["Sim, manda no WhatsApp"],
      sistemas: ["A gente usa o Kommo"],
      aviso: ["WhatsApp"],
      nunca: ["Nunca falar que o financiamento tá aprovado"],
      vendedores: ["Dispensa sim"],
      extra: ["Quando pedirem pra negociar comissão, passa pro gerente", "Se for permuta, anota tudo e passa pro Ricardo", "Acho que é isso"],
    },
    esperado: { categoria: "imobiliaria", minNos: 110, perguntasProibidas: ["horario"] },
  },
  {
    nome: "clinica-apressada",
    descricao: "Dentista sem tempo: respostas curtíssimas e finaliza assim que pode.",
    respostas: {
      negocio: ["odonto"],
      empresa: ["Sorriso, Santos"],
      servicos: ["limpeza 180, clareamento 900, implante"],
      motivos: ["marcar e preço"],
      horario: ["8 às 18"],
      agenda: ["sim"],
      fora: ["anota"],
      pessoa: ["anota"],
      site: ["não"],
      recepcionista: ["Clara"],
      cli_especialidades: ["clínico geral, ortodontia, implante"],
      cli_convenios: ["Odontoprev e Amil Dental"],
      cli_urgencia: ["dor forte encaixa no mesmo dia"],
    },
    esperado: { categoria: "clinica", minNos: 60 },
  },
  {
    nome: "restaurante-que-pula",
    descricao: "Dono de pizzaria que pula metade das perguntas.",
    respostas: {
      negocio: ["pizzaria e esfiharia"],
      empresa: ["Forno di Nonna em Belo Horizonte"],
      horario: ["terça a domingo das 18h às 23h"],
      agenda: ["sim, reserva de mesa"],
      rest_reserva: ["até 12 pessoas, tolerância de 15 minutos"],
      rest_delivery: ["iFood e WhatsApp"],
      rest_eventos: ["aniversário a gente faz, passa pro gerente"],
    },
    esperado: { categoria: "restaurante", minNos: 40 },
  },
  {
    nome: "oficina-perguntadora",
    descricao: "Mecânico desconfiado que pergunta de volta antes de responder.",
    respostas: {
      negocio: ["oficina mecânica"],
      empresa: ["como assim? pra que você precisa disso?", "Auto Center Silva, em Goiânia"],
      servicos: ["revisão, freio, suspensão e alinhamento"],
      motivos: ["orçamento e carro quebrado"],
      horario: ["seg a sex 8 às 18 e sábado 8 às 12"],
      agenda: ["sim"],
      fora: ["o que acontece se eu escolher plantão?", "tem plantão de guincho, (62) 99999-1234"],
      pessoa: ["transfere"],
      transferir: ["(62) 3333-4444"],
      site: ["não tenho"],
      recepcionista: ["Bia, pode ser descontraída"],
      srv_orcamento: ["só vendo o carro"],
      srv_local: ["o cliente traz, mas buscamos em Goiânia"],
      srv_urgencia: ["carro quebrado na rua, passa pro guincho"],
      srv_garantia: ["90 dias de garantia no serviço"],
      vip: ["frotista tem prioridade"],
      reclamacao: ["o Silva, mesmo dia"],
      desconto: ["até 5% no pix"],
      extra: ["não"],
    },
    esperado: { categoria: "servicos", minNos: 70 },
  },
  {
    nome: "petshop-conversadora",
    descricao: "Dona de pet shop informal que manda áudio transcrito, com gírias e tudo numa frase só.",
    respostas: {
      negocio: ["então, eu tenho um petshop com banho e tosa e veterinário, fica no Recife, chama Patas e Cia"],
      servicos: ["banho pequeno porte 60 reais, tosa 90, consulta vet 150"],
      motivos: ["marcar banho, saber preço e bicho passando mal"],
      horario: ["de segunda a sábado das 8 às 19"],
      agenda: ["simmm marca sim"],
      fora: ["se o bicho tiver passando mal manda pro plantão vet 24h, (81) 98888-0000"],
      pessoa: ["anota que eu ligo de volta"],
      site: ["@patasecia no insta, site não"],
      recepcionista: ["Mel! bem fofinha e descontraída"],
      srv_urgencia: ["bicho passando mal, convulsão, atropelado: plantão"],
      extra: ["quando perguntarem de hotelzinho, a gente não faz mais", "é só isso"],
    },
    esperado: { categoria: "servicos", minNos: 60 },
  },
];

async function rodar(persona: Persona) {
  let e: EstadoOnboarding = iniciar();
  const fila = Object.fromEntries(Object.entries(persona.respostas).map(([k, v]) => [k, [...v]]));
  const perguntas: string[] = [];
  let usouModelo = 0;
  for (let i = 0; i < 60 && !e.concluido; i++) {
    const id = e.perguntaAtual!;
    perguntas.push(id);
    const r = fila[id]?.shift();
    if (r === undefined) {
      e = pularPergunta(e);
      continue;
    }
    const ia = await paciencia.run({ ateMs: 60_000 }, () => interpretar(e.perfil, id, r));
    if (ia) usouModelo++;
    e = responder(e, r, ia ?? {});
  }
  const { workflow, secoes } = gerarFluxo(e.perfil);
  const base = getNicho(nichoDoPerfil(e.perfil)).padrao({ nome: e.perfil.campos.empresa_nome ?? "Empresa" });
  const cfg = agentConfigSchema.safeParse(configDoPerfil(base, e.perfil));
  const repetidas = perguntas.filter((x, i) => x !== "extra" && perguntas.indexOf(x) !== i && !/como assim|o que acontece/i.test(persona.respostas[x]?.[0] ?? ""));
  const checks = {
    concluiu: e.concluido,
    categoria: e.perfil.campos.categoria === persona.esperado.categoria,
    fluxoValido: workflowSchema.safeParse(workflow).success && validarWorkflow(workflow).length === 0,
    tamanho: workflow.nos.length >= persona.esperado.minNos,
    semRepetir: repetidas.length === 0,
    naoPerguntouOQueJaSabia: !(persona.esperado.perguntasProibidas ?? []).some((q) => perguntas.includes(q)),
    configValida: cfg.success,
  };
  return { persona, e, workflow, secoes, perguntas, usouModelo, checks, repetidas };
}

async function main() {
  const dir = path.resolve("docs/onboarding/simulacoes");
  mkdirSync(dir, { recursive: true });
  const linhas: string[] = ["# Simulações do onboarding em conversa", "", `Rodado em ${new Date().toISOString()} com o motor de conversa real interpretando as respostas.`, "", "| Persona | Perguntas | Etapas | Conexões | Checagens |", "|---|---|---|---|---|"];
  let falhou = false;
  for (const p of PERSONAS) {
    const r = await rodar(p);
    const ok = Object.values(r.checks).every(Boolean);
    falhou ||= !ok;
    linhas.push(`| [${p.nome}](${p.nome}.md) | ${r.perguntas.length} | ${r.workflow.nos.length} | ${r.workflow.arestas.length} | ${ok ? "✅ todas" : `❌ ${Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k).join(", ")}`} |`);
    const md = [
      `# ${p.nome}`,
      "",
      `> ${p.descricao}`,
      "",
      `**Resultado:** ${r.workflow.nos.length} etapas, ${r.workflow.arestas.length} conexões, ${r.secoes.length} seções (${r.secoes.map((s) => s.titulo).join(", ")}). Respostas interpretadas pelo modelo: ${r.usouModelo}.`,
      "",
      "## Checagens",
      "",
      ...Object.entries(r.checks).map(([k, v]) => `- ${v ? "✅" : "❌"} ${k}${k === "semRepetir" && r.repetidas.length ? ` (repetiu: ${r.repetidas.join(", ")})` : ""}`),
      "",
      "## Conversa",
      "",
      ...r.e.mensagens.map((m) => `**${m.papel === "recepta" ? "Recepta" : "Dono"}:** ${m.texto}${m.mudancas?.nos ? `  \n<sub>+${m.mudancas.nos} etapas · +${m.mudancas.arestas} conexões</sub>` : ""}\n`),
      "## Perfil entendido",
      "",
      "```json",
      JSON.stringify(r.e.perfil, null, 2),
      "```",
    ].join("\n");
    writeFileSync(path.join(dir, `${p.nome}.md`), md);
    console.log(`${ok ? "✓" : "✗"} ${p.nome}: ${r.perguntas.length} perguntas, ${r.workflow.nos.length} etapas, ${r.workflow.arestas.length} conexões`, ok ? "" : r.checks);
  }
  writeFileSync(path.join(dir, "README.md"), linhas.join("\n") + "\n");
  process.exit(falhou ? 1 : 0);
}

void main();
