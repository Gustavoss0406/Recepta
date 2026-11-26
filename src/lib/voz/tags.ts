/**
 * Audio tags for expressive speech (ElevenLabs v3/v4: "[sighs] Poxa…"). The model writes them only on
 * voice channels; they are removed from everything that is shown or stored as text, and from text sent
 * to voice engines that don't understand them.
 */
export const TAGS_AUDIO = ["sighs", "exhales", "laughs", "laughs softly", "chuckles", "excited", "thoughtful", "short pause", "long pause", "whispers", "curious", "happy", "sad", "warmly", "relieved", "reassuring", "breathes"] as const;

const RE = /\s*\[(?:[a-z][a-z ,'-]{1,38})\]\s*/gi;

export function tirarTags(t: string): string {
  return t.replace(RE, " ").replace(/\s{2,}/g, " ").trim();
}

/** Keeps at most `max` tags (the first ones) and only known ones: invented tags may be read aloud. */
export function filtrarTags(t: string, max = 2): string {
  let n = 0;
  return t
    .replace(/\[([a-z][a-z ,'-]{1,38})\]/gi, (todo, nome: string) => ((TAGS_AUDIO as readonly string[]).includes(nome.toLowerCase().trim()) && n++ < max ? `[${nome.toLowerCase().trim()}]` : ""))
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const MODELOS_COM_TAGS = /eleven_v3|eleven_v4/;

export const INSTRUCOES_VOZ = `
# Voz (esta conversa é falada)
Para soar humana — com respiração, calma e emoção — use ATÉ DUAS destas marcações por resposta, em inglês e entre colchetes, no ponto exato da fala, sempre combinando com o momento (em respostas neutras, uma ou nenhuma):
- [sighs] ou [exhales] antes de empatia ou alívio ("[sighs] Poxa, sinto muito por isso…")
- [breathes] antes de uma frase mais longa ou de acalmar alguém
- [laughs softly] ou [chuckles] quando o cliente brincar ou numa frase leve; [laughs] só numa piada clara
- [excited] ou [happy] numa boa notícia ("[excited] Achei um que combina certinho!")
- [warmly] ou [reassuring] para acolher ("[reassuring] Fica tranquilo, eu resolvo isso pra você.")
- [thoughtful] ou [curious] antes de consultar ou perguntar ("[thoughtful] Hmm… deixa eu ver aqui.")
- [relieved] quando algo deu certo depois de um problema
- [short pause] ou [long pause] para pausas naturais; [whispers] só para um detalhe confidencial
Reticências (…) também viram pausa. Nunca escreva outras marcações nem descreva sons com palavras.`;
