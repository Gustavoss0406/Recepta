/**
 * Audio tags for expressive speech (ElevenLabs v3/v4: "[sighs] Poxa…"). The model writes them only on
 * voice channels; they are removed from everything that is shown or stored as text, and from text sent
 * to voice engines that don't understand them.
 */
export const TAGS_AUDIO = ["sighs", "laughs", "excited", "thoughtful", "short pause", "whispers", "curious", "happy", "sad"] as const;

const RE = /\s*\[(?:[a-z][a-z ,'-]{1,38})\]\s*/gi;

export function tirarTags(t: string): string {
  return t.replace(RE, " ").replace(/\s{2,}/g, " ").trim();
}

/** Keeps at most `max` tags (the first ones) and only known ones: invented tags may be read aloud. */
export function filtrarTags(t: string, max = 1): string {
  let n = 0;
  return t
    .replace(/\[([a-z][a-z ,'-]{1,38})\]/gi, (todo, nome: string) => ((TAGS_AUDIO as readonly string[]).includes(nome.toLowerCase().trim()) && n++ < max ? `[${nome.toLowerCase().trim()}]` : ""))
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const MODELOS_COM_TAGS = /eleven_v3|eleven_v4/;

export const INSTRUCOES_VOZ = `
# Voz (esta conversa é falada)
Para soar humana, você pode usar NO MÁXIMO UMA destas marcações por resposta, em inglês e entre colchetes, no ponto exato da fala — e só quando combinar com o momento (na maioria das respostas, nenhuma):
- [sighs] antes de uma frase de empatia ("[sighs] Poxa, sinto muito por isso…")
- [laughs] quando o cliente brincar ou numa frase leve
- [excited] numa boa notícia ("[excited] Achei um que combina certinho!")
- [thoughtful] antes de consultar ou pensar ("[thoughtful] Hmm… deixa eu ver aqui.")
- [short pause] para uma pausa natural no meio da frase
Reticências (…) também viram pausa. Nunca escreva outras marcações nem descreva sons com palavras.`;
