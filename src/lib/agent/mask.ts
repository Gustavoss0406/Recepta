/** LGPD masking for transcripts: CPF, CNPJ-like and card numbers, phone tails preserved. */

const CPF = /\b(\d{3})[.\s-]?(\d{3})[.\s-]?(\d{3})[-\s]?(\d{2})\b/g;
const CARTAO = /\b(?:\d[ -]?){12,15}(\d{4})\b/g;

export function mascarar(texto: string): string {
  return texto
    .replace(CARTAO, (_m, fim: string) => `•••• •••• •••• ${fim}`)
    .replace(CPF, (_m, _a, _b, _c, d: string) => `•••.•••.•••-${d}`);
}

export function contemDadoSensivel(texto: string): boolean {
  CPF.lastIndex = 0;
  CARTAO.lastIndex = 0;
  const r = CPF.test(texto) || CARTAO.test(texto);
  CPF.lastIndex = 0;
  CARTAO.lastIndex = 0;
  return r;
}
