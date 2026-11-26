import { gerarFluxo } from "./gerador";
import { CAMPOS, perfilVazio, type Perfil, type RegraLivre } from "./perfil";
import { aplicarCampos, lerRegra, pergunta, progresso, proximaPergunta, pular, reacaoLocal, type Pergunta } from "./perguntas";

export interface Mensagem {
  papel: "recepta" | "dono";
  texto: string;
  /** What the answer changed in the flow (shown as a chip under the message). */
  mudancas?: { secoes: string[]; nos: number; arestas: number };
}

export interface EstadoOnboarding {
  perfil: Perfil;
  mensagens: Mensagem[];
  perguntaAtual: string | null;
  concluido: boolean;
}

/** What the model understood (optional: without it the local parser is used). */
export interface Interpretacao {
  campos?: Record<string, string>;
  regra?: RegraLivre | null;
  duvida?: boolean;
  /** Short informal reaction, no question. */
  reacao?: string;
  /** Answer to the owner's own question, when duvida. */
  explicacao?: string;
}

export const ABERTURA =
  "[excited] Oi! Eu sou a Recepta 👋 Vou montar a recepcionista virtual da sua empresa numa conversa rápida — e você vai ver o fluxo de atendimento se construindo aqui do lado.";

export function iniciar(): EstadoOnboarding {
  const p = perfilVazio();
  const q = proximaPergunta(p)!;
  return { perfil: p, mensagens: [{ papel: "recepta", texto: `${ABERTURA} ${q.texto(p)}` }], perguntaAtual: q.id, concluido: false };
}

const DUVIDA = /^\s*(como assim|o que (e|é|seria|significa)|nao entendi|não entendi|pode explicar|explica melhor|me explica|me da um exemplo|me dá um exemplo|tipo o que|exemplo\??$)/i;

export function ehDuvida(t: string) {
  return DUVIDA.test(t.trim());
}

function contar(p: Perfil) {
  const { workflow, secoes } = gerarFluxo(p);
  return { nos: workflow.nos.length, arestas: workflow.arestas.length, secoes: secoes.map((s) => s.titulo) };
}

function fecharSeAcabou(e: EstadoOnboarding, prefixo: string): EstadoOnboarding {
  const q = proximaPergunta(e.perfil);
  if (q) return { ...e, perguntaAtual: q.id, mensagens: [...e.mensagens.slice(0, -1), { ...e.mensagens.at(-1)!, texto: `${prefixo} ${q.texto(e.perfil)}`.trim() }] };
  const c = contar(e.perfil);
  const nome = e.perfil.campos.recep_nome || "sua recepcionista";
  return {
    ...e,
    perguntaAtual: null,
    concluido: true,
    mensagens: [
      ...e.mensagens.slice(0, -1),
      {
        ...e.mensagens.at(-1)!,
        texto: `${prefixo} [excited] Pronto! Montei um fluxo só seu, com ${c.nos} etapas e ${c.arestas} conexões — do "alô" à despedida, dentro e fora do horário. Bora testar a ${nome}?`.trim(),
      },
    ],
  };
}

/**
 * One owner message → updated profile, the Recepta's reaction + next question. Never asks the
 * same thing twice: anything the owner volunteers fills its field and that question is skipped.
 */
export function responder(e: EstadoOnboarding, texto: string, ia: Interpretacao = {}): EstadoOnboarding {
  const t = texto.trim().slice(0, 1000);
  const q = e.perguntaAtual ? pergunta(e.perguntaAtual) : proximaPergunta(e.perfil);
  const mensagens: Mensagem[] = [...e.mensagens, { papel: "dono", texto: t }];
  if (!q || e.concluido) return { ...e, mensagens };

  // the owner asked something back: explain and ask again (doesn't advance)
  if ((ia.duvida || (ehDuvida(t) && !ia.campos?.[q.chaves[0]])) && q.id !== "negocio") {
    return { ...e, mensagens: [...mensagens, { papel: "recepta", texto: `${ia.explicacao || q.ajuda} ${q.texto(e.perfil)}` }] };
  }

  const antes = contar(e.perfil);
  let p = aplicarResposta(e.perfil, q, t, ia);
  if (q.id === "extra" && !p.campos.extra_fim) {
    const r = ia.regra?.quando && ia.regra.fazer ? ia.regra : (lerRegra(t) ?? { quando: t.slice(0, 150), fazer: "passar o caso para a equipe com um relatório" });
    p = { ...p, regras: [...p.regras, { quando: r.quando.slice(0, 150), fazer: r.fazer.slice(0, 300) }] };
  }
  // a question that still has no value after the answer is treated as answered with the raw text
  if (!p.campos[q.chaves[0]] && q.id !== "extra") p = aplicarCampos(p, { [q.chaves[0]]: t.slice(0, 300) });

  const depois = contar(p);
  const novas = depois.secoes.filter((s) => !antes.secoes.includes(s));
  const mudancas = { secoes: novas, nos: depois.nos - antes.nos, arestas: depois.arestas - antes.arestas };
  const reacao = (ia.reacao?.trim().replace(/^((\[[a-z ]+\])?\s*)[.…\s]+/i, "$1") || reacaoLocal(q, p)).replace(/\?+\s*$/, ".").replace(/([^.!…])\s*$/, "$1.");
  const comentario = novas.length ? ` Acabei de criar ${novas.length === 1 ? "o caminho" : "os caminhos"} ${juntar(novas)}.` : "";
  return fecharSeAcabou({ ...e, perfil: p, mensagens: [...mensagens, { papel: "recepta", texto: `${reacao}${comentario}`, mudancas }] }, `${reacao}${comentario}`);
}

function aplicarResposta(p: Perfil, q: Pergunta, t: string, ia: Interpretacao): Perfil {
  const local = q.extrair(t, p);
  const proprias: Record<string, string | undefined> = { ...local };
  const alheias: Record<string, string> = {};
  for (const [k, v] of Object.entries(ia.campos ?? {})) {
    if (!(k in CAMPOS) || typeof v !== "string" || !v.trim() || /^(null|undefined|desconhecido|n\/a)$/i.test(v.trim())) continue;
    if (q.chaves.includes(k)) proprias[k] = v;
    else if (!p.campos[k]) alheias[k] = v;
  }
  // locally-certain categoria wins over a model guess only when the model said nothing
  return aplicarCampos(aplicarCampos(p, alheias), proprias);
}

export function pularPergunta(e: EstadoOnboarding): EstadoOnboarding {
  const q = e.perguntaAtual ? pergunta(e.perguntaAtual) : null;
  if (!q || e.concluido) return e;
  const p = pular(e.perfil, q);
  const msg = "[chuckles] Tranquilo, deixo no padrão e você muda depois se quiser.";
  return fecharSeAcabou({ ...e, perfil: p, mensagens: [...e.mensagens, { papel: "dono", texto: "Pular" }, { papel: "recepta", texto: msg }] }, msg);
}

/** "Já está bom": every remaining question takes its default. */
export function finalizar(e: EstadoOnboarding): EstadoOnboarding {
  let p = e.perfil;
  for (let q = proximaPergunta(p); q; q = proximaPergunta(p)) p = pular(p, q);
  const msg = "[warmly] Fechado! Completei o resto com o padrão que funciona pra maioria.";
  return fecharSeAcabou({ ...e, perfil: p, mensagens: [...e.mensagens, { papel: "dono", texto: "Pode finalizar" }, { papel: "recepta", texto: msg }] }, msg);
}

export function resumo(e: EstadoOnboarding) {
  return { ...progresso(e.perfil), ...contar(e.perfil) };
}

const juntar = (xs: string[]) => (xs.length <= 1 ? `"${xs[0]}"` : `${xs.slice(0, -1).map((x) => `"${x}"`).join(", ")} e "${xs.at(-1)}"`);

/** Facts a site/Instagram can answer for the owner (preferences like tone or transfers stay with them). */
export const CAMPOS_DA_ANALISE = ["empresa_nome", "cidade", "servicos", "motivos", "horario", "agenda", "regioes", "operacao", "especialidades", "convenios", "delivery", "eventos", "atende_local", "orcamento", "garantia", "captacao"];

export interface ResultadoAnalise {
  site?: string;
  instagram?: string;
  /** Facts found (normalized like the conversation's fields). */
  campos: Record<string, string>;
  /** Short human list of what was found ("Horário: seg a sex 9h às 18h"). */
  achados: string[];
}

/**
 * The owner filled the site/Instagram fields: what the analysis found fills every question it can
 * answer (only empty ones — what the owner already said wins), those questions are skipped, and the
 * flow and the next questions follow the business that was found.
 */
export function aplicarAnalise(e: EstadoOnboarding, r: ResultadoAnalise): EstadoOnboarding {
  if (e.concluido) return e;
  const antes = contar(e.perfil);
  const campos: Record<string, string> = { ...e.perfil.campos, site: r.site?.trim() || "nao", ...(r.instagram ? { instagram: r.instagram } : {}) };
  const preenchidos: string[] = [];
  for (const [k, v] of Object.entries(r.campos)) {
    if (!CAMPOS_DA_ANALISE.includes(k) || !v?.trim() || campos[k]) continue;
    campos[k] = v.trim().slice(0, 400);
    preenchidos.push(k);
  }
  const p = { ...e.perfil, campos };
  const depois = contar(p);
  const novas = depois.secoes.filter((s) => !antes.secoes.includes(s));
  const fala = [r.site && `Site: ${r.site}`, r.instagram && `Instagram: ${r.instagram}`].filter(Boolean).join(" · ") || "Não tenho site nem Instagram";
  const texto = !r.site && !r.instagram
    ? "[warmly] Sem problema, a gente monta tudo conversando mesmo."
    : r.achados.length
      ? `[excited] Olha só o que eu achei: ${r.achados.slice(0, 5).join("; ")}. Já deixei tudo anotado${preenchidos.length ? ", então vou pular o que já sei" : ""}.${novas.length ? ` Abri os caminhos ${novas.map((s) => `"${s}"`).join(", ")}.` : ""}`
      : "[thoughtful] Dei uma olhada, mas não achei muita coisa pública ainda. Sem problema, sigo perguntando.";
  return fecharSeAcabou(
    { ...e, perfil: p, mensagens: [...e.mensagens, { papel: "dono", texto: fala }, { papel: "recepta", texto, mudancas: { secoes: novas, nos: depois.nos - antes.nos, arestas: depois.arestas - antes.arestas } }] },
    texto,
  );
}
