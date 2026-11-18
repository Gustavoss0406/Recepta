/**
 * Public voice catalog. Voices are sold under our own names; the engine and
 * provider voice IDs stay server-side (see src/server/voice/catalog.server.ts).
 */
/**
 * Voice engines: "premium" = licensed cloud engine (top fidelity); "drama" = Fish Audio drama-3
 * self-hosted on our GPU; "voicestudio" = VoxCPM2 (Apache-2.0) served by VoiceStudio.
 */
export type MotorVoz = "premium" | "drama" | "voicestudio";

export const MOTORES: Record<MotorVoz, { nome: string; descricao: string }> = {
  premium: { nome: "Premium", descricao: "Máxima naturalidade, em nuvem" },
  drama: { nome: "Própria · Drama", descricao: "Motor próprio em GPU dedicada · Built with Fish Audio" },
  voicestudio: { nome: "Própria · Studio", descricao: "Motor próprio, código aberto (VoxCPM2)" },
};

export interface Voice {
  id: string;
  motor: MotorVoz;
  name: string;
  gender: "feminina" | "masculina";
  accent: string;
  style: string;
  sample: string;
  /** Orb color used on the voice avatar. */
  tone: "mint" | "peach" | "lavender" | "sky" | "rose";
}

export const VOICES: Voice[] = [
  {
    id: "lia",
    name: "Lia",
    gender: "feminina",
    accent: "Paulista",
    style: "Acolhedora · recepção",
    sample: "Clínica Sorriso, boa tarde! Aqui é a Lia. Como posso te ajudar hoje?",
    tone: "mint",
    motor: "premium",
  },
  {
    id: "rafael",
    name: "Rafael",
    gender: "masculina",
    accent: "Carioca",
    style: "Confiante · vendas",
    sample: "Fala, tudo certo? Aqui é o Rafael, da Imobiliária Horizonte. Vi que você se interessou pelo apartamento na Tijuca.",
    tone: "sky",
    motor: "premium",
  },
  {
    id: "bia",
    name: "Bia",
    gender: "feminina",
    accent: "Mineira",
    style: "Calma · suporte",
    sample: "Oi! Já localizei seu pedido aqui. Ele saiu para entrega hoje cedo e chega até as seis da tarde.",
    tone: "peach",
    motor: "premium",
  },
  {
    id: "caio",
    name: "Caio",
    gender: "masculina",
    accent: "Nordestino",
    style: "Animado · restaurantes",
    sample: "Boa noite! Mesa para quatro às oito e meia, no nome de Fernanda. Tá reservado, viu?",
    tone: "rose",
    motor: "premium",
  },
  {
    id: "helena",
    name: "Helena",
    gender: "feminina",
    accent: "Gaúcha",
    style: "Formal · escritórios",
    sample: "Escritório Moraes Advocacia, bom dia. O doutor Paulo está em audiência; posso agendar um retorno?",
    tone: "lavender",
    motor: "premium",
  },
  {
    id: "tomas",
    name: "Tomás",
    gender: "masculina",
    accent: "Neutro",
    style: "Executivo · central",
    sample: "Obrigado por ligar. Para segunda via do boleto, eu já envio o código Pix por WhatsApp agora mesmo.",
    tone: "mint",
    motor: "premium",
  },
];

/** Our own engines: voices created by voice design (described, never cloned from a person). */
VOICES.push(
  {
    id: "clara",
    name: "Clara",
    gender: "feminina",
    accent: "Neutro",
    style: "Acolhedora · clínicas",
    sample: "Clínica Sorriso, bom dia! Aqui é a Clara, recepcionista virtual. Como posso te ajudar?",
    tone: "mint",
    motor: "voicestudio",
  },
  {
    id: "davi",
    name: "Davi",
    gender: "masculina",
    accent: "Neutro",
    style: "Seguro · escritórios",
    sample: "Bom dia, aqui é o Davi. Posso verificar a agenda e já deixar o seu horário reservado.",
    tone: "sky",
    motor: "voicestudio",
  },
  {
    id: "marina",
    name: "Marina",
    gender: "feminina",
    accent: "Paulista",
    style: "Expressiva · atendimento",
    sample: "Oi! Aqui é a Marina. Vou anotar tudo e já passo para a equipe te retornar ainda hoje.",
    tone: "peach",
    motor: "drama",
  },
  {
    id: "otavio",
    name: "Otávio",
    gender: "masculina",
    accent: "Carioca",
    style: "Cordial · restaurantes",
    sample: "Boa noite! Aqui é o Otávio. Mesa para quatro às oito e meia, no nome da Fernanda, certo?",
    tone: "rose",
    motor: "drama",
  },
);

export function getVoice(id: string): Voice | undefined {
  return VOICES.find((v) => v.id === id);
}
