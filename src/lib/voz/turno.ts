/**
 * End-of-turn heuristics for phone calls in Brazilian Portuguese. Silence alone (VAD) cuts people
 * who pause mid-sentence ("meu CPF é… 123"); the transcript tells whether the thought is finished.
 */
const CONTINUA = new Set([
  "e", "ou", "mas", "que", "porque", "pois", "então", "entao", "se", "quando", "como", "onde",
  "de", "do", "da", "dos", "das", "no", "na", "nos", "nas", "em", "pra", "para", "pro", "com", "sem", "por", "pelo", "pela",
  "o", "a", "os", "as", "um", "uma", "uns", "umas", "meu", "minha", "meus", "minhas", "seu", "sua", "é", "eh", "tipo", "assim", "aí", "ai",
]);
const COMPLETAS = /^(sim|não|nao|ok|okay|isso|isso mesmo|pode ser|claro|certo|beleza|obrigad[oa]|valeu|tchau|até mais|ate mais|oi|olá|ola|alô|alo|bom dia|boa tarde|boa noite)[.!?]*$/i;

/** Digits still missing when the caller is dictating a number we know the length of. */
function numeroIncompleto(t: string): boolean {
  const m = t.match(/(cpf|telefone|celular|whats(app)?|n[úu]mero|cep|cnpj)[^\d]{0,20}([\d .\-()]+)$/i);
  if (!m) return false;
  const dig = m[3].replace(/\D/g, "").length;
  const alvo = /cpf/i.test(m[1]) ? 11 : /cnpj/i.test(m[1]) ? 14 : /cep/i.test(m[1]) ? 8 : 10;
  return dig > 0 && dig < alvo;
}

/** Extra milliseconds to wait for the caller before answering (0 = answer now). */
export function esperaExtraMs(texto: string): number {
  const t = texto.trim();
  if (!t) return 0;
  if (COMPLETAS.test(t)) return 0;
  if (numeroIncompleto(t)) return 1600;
  if (/(,|…|\.\.\.|-)$/.test(t)) return 900;
  const ultima = t.replace(/[.!?]+$/, "").split(/\s+/).pop()!.toLowerCase();
  if (CONTINUA.has(ultima)) return 900;
  if (/\?$/.test(t)) return 0;
  if (t.split(/\s+/).length <= 2) return 500;
  return 250;
}

/** Joins utterances that belong to the same turn. */
export function juntar(partes: string[]): string {
  return partes
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.!?])/g, "$1");
}
