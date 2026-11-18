import { z } from "zod";

/**
 * API tools the business configures: the receptionist calls the business's own systems during the
 * call (look up an order, list properties, create a lead). Pure helpers: request building and
 * response filtering, so the model only ever sees the fields the owner released.
 *
 * Levels: "consultar" = read only (also runs in tests); "registrar" = creates/changes something, only
 * after the caller confirmed out loud, simulated in tests.
 */
export const NIVEIS_API = ["consultar", "registrar"] as const;

export const parametroApiSchema = z.object({
  nome: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Use letras minúsculas, números e _"),
  descricao: z.string().min(3).max(200),
  obrigatorio: z.boolean(),
});

export const ferramentaApiSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{6,24}$/),
  nome: z.string().regex(/^[a-z][a-z0-9_]{2,39}$/, "Nome da ferramenta: letras minúsculas e _ (ex.: consultar_pedido)"),
  descricao: z.string().min(10).max(400),
  nivel: z.enum(NIVEIS_API),
  metodo: z.enum(["GET", "POST", "PATCH"]),
  /** May contain {param} placeholders, e.g. https://api.loja.com/pedidos/{numero} */
  url: z.string().url().max(500),
  parametros: z.array(parametroApiSchema).max(10),
  /** Dot paths released to the receptionist (e.g. "status", "itens.nome"). Empty = nothing but ok/status. */
  campos: z.array(z.string().regex(/^[A-Za-z0-9_.]{1,80}$/)).max(30),
  /** Fixed headers that are not secret (e.g. Accept-Profile). Secrets live encrypted in integracoes. */
  cabecalhos: z.record(z.string().regex(/^[A-Za-z0-9-]{1,60}$/), z.string().max(300)).default({}),
  temCredencial: z.boolean().default(false),
});
export type FerramentaApi = z.infer<typeof ferramentaApiSchema>;

export class ErroApi extends Error {}

/** Builds the HTTP request: placeholders go into the path (encoded), the rest into query or JSON body. */
export function montarRequisicao(f: FerramentaApi, args: Record<string, unknown>): { url: string; metodo: string; corpo?: string } {
  const valores: Record<string, string> = {};
  for (const p of f.parametros) {
    const v = args[p.nome];
    if (v === undefined || v === null || String(v).trim() === "") {
      if (p.obrigatorio) throw new ErroApi(`Falta o dado obrigatório: ${p.nome}`);
      continue;
    }
    valores[p.nome] = String(v).slice(0, 300);
  }
  const usados = new Set<string>();
  const caminho = f.url.replace(/\{([a-z][a-z0-9_]*)\}/g, (_, nome: string) => {
    usados.add(nome);
    if (valores[nome] === undefined) throw new ErroApi(`Falta o dado obrigatório: ${nome}`);
    return encodeURIComponent(valores[nome]);
  });
  const resto = Object.fromEntries(Object.entries(valores).filter(([k]) => !usados.has(k)));
  if (f.metodo === "GET") {
    const u = new URL(caminho);
    for (const [k, v] of Object.entries(resto)) u.searchParams.set(k, v);
    return { url: u.toString(), metodo: "GET" };
  }
  return { url: caminho, metodo: f.metodo, corpo: JSON.stringify(resto) };
}

/** Value at a dot path; arrays are mapped (itens.nome → ["a","b"]). */
function pegar(obj: unknown, partes: string[]): unknown {
  if (!partes.length) return obj;
  if (Array.isArray(obj)) return obj.slice(0, 10).map((x) => pegar(x, partes));
  if (obj && typeof obj === "object") return pegar((obj as Record<string, unknown>)[partes[0]], partes.slice(1));
  return undefined;
}

/** Only the released fields reach the model, capped in size (free engines have small token budgets). */
export function filtrarResposta(dados: unknown, campos: string[], limite = 1500): Record<string, unknown> {
  const fora: Record<string, unknown> = {};
  // Top-level arrays (e.g. Supabase REST returns a list): apply the paths to each item.
  const base = Array.isArray(dados) ? { itens: dados.slice(0, 10) } : dados;
  const lista = Array.isArray(dados) ? campos.map((c) => (c.startsWith("itens.") ? c : `itens.${c}`)) : campos;
  for (const c of lista) {
    const v = pegar(base, c.split("."));
    if (v !== undefined) fora[c] = v;
  }
  if (Array.isArray(dados)) fora.total = dados.length;
  let json = JSON.stringify(fora);
  if (json.length > limite) {
    json = json.slice(0, limite);
    return { aviso: "resposta cortada", parcial: json };
  }
  return fora;
}

/** Every dot path in a sample response, for the "which fields can she see?" picker. */
export function listarCampos(dados: unknown, prefixo = "", fora = new Set<string>(), nivel = 0): string[] {
  if (nivel > 4) return [...fora];
  const alvo = Array.isArray(dados) ? dados[0] : dados;
  if (alvo && typeof alvo === "object" && !Array.isArray(alvo))
    for (const [k, v] of Object.entries(alvo)) {
      const p = prefixo ? `${prefixo}.${k}` : k;
      if (v && typeof v === "object") listarCampos(v, p, fora, nivel + 1);
      else fora.add(p);
    }
  return [...fora].slice(0, 80);
}

/** Tool definition for the model (Anthropic tool format). */
export function definicaoFerramenta(f: FerramentaApi) {
  const props: Record<string, unknown> = Object.fromEntries(f.parametros.map((p) => [p.nome, { type: "string", description: p.descricao }]));
  const req = f.parametros.filter((p) => p.obrigatorio).map((p) => p.nome);
  if (f.nivel === "registrar") {
    props.cliente_confirmou = { type: "boolean", description: "true SÓ depois de repetir os dados ao cliente e ele confirmar em voz alta" };
    req.push("cliente_confirmou");
  }
  return {
    name: f.nome,
    description: `${f.descricao}${f.nivel === "registrar" ? " ANTES de usar, repita os dados para o cliente e peça confirmação." : ""}`,
    input_schema: { type: "object" as const, properties: props, required: req },
  };
}
