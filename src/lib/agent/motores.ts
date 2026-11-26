/**
 * Which AI drives the calls. RecepIA (default, free) is our own blend of free models in rotation;
 * the others use the customer's own API key and are billed by that provider to the customer.
 */
export const MOTORES = [
  {
    id: "recepia",
    nome: "RecepIA",
    empresa: "Recepta",
    descricao: "Nossa IA: une vários modelos gratuitos e troca sozinha quando um fica lento. Grátis, sem chave.",
    gratis: true,
    modelos: [] as string[],
    ondeChave: "",
  },
  {
    id: "openai",
    nome: "ChatGPT",
    empresa: "OpenAI",
    descricao: "Modelos GPT da OpenAI com a sua chave.",
    gratis: false,
    baseURL: "https://api.openai.com/v1",
    modelos: ["gpt-5.1-mini", "gpt-5.1", "gpt-4.1-mini"],
    ondeChave: "platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    nome: "Claude",
    empresa: "Anthropic",
    descricao: "Modelos Claude da Anthropic com a sua chave.",
    gratis: false,
    modelos: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"],
    ondeChave: "console.anthropic.com/settings/keys",
  },
  {
    id: "gemini",
    nome: "Gemini",
    empresa: "Google",
    descricao: "Modelos Gemini do Google AI Studio com a sua chave.",
    gratis: false,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    modelos: ["gemini-3-flash", "gemini-3-pro", "gemini-2.5-flash"],
    ondeChave: "aistudio.google.com/apikey",
  },
  {
    id: "opencode",
    nome: "OpenCode Zen",
    empresa: "OpenCode",
    descricao: "Modelos selecionados pelo OpenCode Zen com a sua chave.",
    gratis: false,
    baseURL: "https://opencode.ai/zen/v1",
    modelos: ["kimi-k2", "qwen3-coder", "glm-4.6"],
    ondeChave: "opencode.ai/zen",
  },
  {
    id: "deepseek",
    nome: "DeepSeek",
    empresa: "DeepSeek",
    descricao: "Modelos DeepSeek com a sua chave.",
    gratis: false,
    baseURL: "https://api.deepseek.com/v1",
    modelos: ["deepseek-chat", "deepseek-reasoner"],
    ondeChave: "platform.deepseek.com/api_keys",
  },
] as const;

export type IdMotor = (typeof MOTORES)[number]["id"];
export const IDS_MOTOR = MOTORES.map((m) => m.id) as [IdMotor, ...IdMotor[]];
export const motor = (id: string) => MOTORES.find((m) => m.id === id) ?? MOTORES[0];
