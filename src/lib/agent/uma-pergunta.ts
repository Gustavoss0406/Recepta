/**
 * Phone etiquette enforced in code: at most ONE question per answer. Small models keep stacking
 * "Qual região? E o preço? Me diz seu nome?" even when told not to. Everything up to and including
 * the first question is kept; the rest waits for the next turn.
 */
export function umaPergunta(falas: string[]): string[] {
  const fora: string[] = [];
  for (const f of falas) {
    const i = f.indexOf("?");
    if (i < 0) {
      fora.push(f);
      continue;
    }
    // keep the sentence that holds the first "?" (and any trailing closing quote/space)
    fora.push(f.slice(0, i + 1).trim());
    break;
  }
  return fora.filter(Boolean);
}
