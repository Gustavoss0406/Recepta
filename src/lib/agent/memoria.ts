/**
 * What the caller already told us (name, phone, e-mail), captured deterministically from the
 * answers so the receptionist never asks twice — small models forget even with the history.
 */
export type Memoria = Record<string, string>;

const NAO_NOME = /^(sim|não|nao|isso|ok|oi|olá|ola|salve|e aí|opa|bom dia|boa tarde|boa noite|comprar|alugar|obrigad[oa]|pode|claro|tá|ta|beleza|já falei|ja falei)$/i;

function titulo(t: string) {
  return t
    .toLowerCase()
    .split(/\s+/)
    .map((p) => (/^(da|de|do|das|dos|e)$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

export function extrairDados(perguntaAnterior: string, resposta: string, atual: Memoria = {}): Memoria {
  const m: Memoria = {};
  const r = resposta.trim();
  // phone: 10–13 digits anywhere
  const digitos = r.replace(/\D/g, "");
  const tel = /(\+?55\s*)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/.exec(r);
  if (tel && digitos.length >= 10 && digitos.length <= 13) m.telefone = tel[0].replace(/\s+/g, " ").trim();
  const email = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(r);
  if (email) m.email = email[0].toLowerCase();
  // name: explicit ("meu nome é…", "aqui é o…", "sou a…") or a short answer right after being asked
  const explicito = /(?:meu nome é|me chamo|aqui é (?:o|a)?|sou (?:o|a))\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3})/i.exec(r);
  // stop at the first connector: "joão da silva e quero alugar" → "joão da silva"
  let nome = explicito?.[1].replace(/\s+(e|que|quero|queria|tô|to|estou|preciso|gostaria)\b.*$/i, "");
  if (!nome && /\bnome\b/i.test(perguntaAnterior)) {
    const limpo = r
      .replace(/(^|\s)(é|e)\s+(o|a)\s+/i, " ")
      .replace(/[,.!?].*$/, "")
      .replace(/\b(já falei|ja falei|pode ser|é|sou)\b/gi, "")
      .trim();
    if (/^[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3}$/.test(limpo) && !NAO_NOME.test(limpo)) nome = limpo;
  }
  if (nome && !NAO_NOME.test(nome)) m.nome = titulo(nome);
  return { ...atual, ...m };
}

export function contextoMemoria(m: Memoria, telefoneLigacao?: string | null): string | null {
  const linhas = [
    m.nome && `nome: ${m.nome}`,
    m.telefone && `telefone: ${m.telefone}`,
    !m.telefone && telefoneLigacao && `telefone de quem está ligando: ${telefoneLigacao} (pergunte se pode usar este)`,
    m.email && `e-mail: ${m.email}`,
  ].filter(Boolean);
  return linhas.length ? `Dados que o cliente JÁ informou (não pergunte de novo, só confirme se precisar):\n- ${linhas.join("\n- ")}` : null;
}
