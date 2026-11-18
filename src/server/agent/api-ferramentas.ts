import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { cifrar, decifrar } from "@/server/cripto";
import { urlPublicaSegura } from "@/server/crawler/seguranca";
import { ErroApi, filtrarResposta, listarCampos, montarRequisicao, type FerramentaApi } from "@/lib/agent/api-ferramenta";

/** Secret header per tool (e.g. Authorization: Bearer …, apikey: …), encrypted at rest. */
const tipoCred = (id: string) => `api:${id}`;

export async function salvarCredencialApi(orgId: string, id: string, cabecalho: string, valor: string) {
  if (!/^[A-Za-z0-9-]{1,60}$/.test(cabecalho)) throw new ErroApi("Nome de cabeçalho inválido");
  const db = getDb();
  await db.delete(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, tipoCred(id))));
  if (!valor.trim()) return;
  await db.insert(schema.integracoes).values({ orgId, tipo: tipoCred(id), status: "conectado", credenciais: cifrar(JSON.stringify({ cabecalho, valor: valor.trim() })) });
}

async function credencial(orgId: string, id: string): Promise<Record<string, string>> {
  const [i] = await getDb()
    .select()
    .from(schema.integracoes)
    .where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, tipoCred(id))));
  if (!i?.credenciais) return {};
  const c = JSON.parse(decifrar(i.credenciais)) as { cabecalho: string; valor: string };
  return { [c.cabecalho]: c.valor };
}

export interface ResultadoApi {
  ok: boolean;
  status?: number;
  dados?: Record<string, unknown>;
  erro?: string;
  simulado?: boolean;
  /** Only for the owner's "Testar" button: every field the API returned. */
  camposDisponiveis?: string[];
}

/**
 * Calls the business's API. Public HTTPS hosts only (no internal network), 6 s timeout, response
 * filtered to the released fields. "registrar" needs the caller's spoken confirmation and is
 * simulated in tests; "consultar" runs for real in tests so the owner sees real answers.
 */
export async function executarApi(
  orgId: string,
  f: FerramentaApi,
  args: Record<string, unknown>,
  opts: { teste?: boolean; paraDono?: boolean } = {},
): Promise<ResultadoApi> {
  if (f.nivel === "registrar" && !opts.paraDono && args.cliente_confirmou !== true)
    return { ok: false, erro: "Antes de registrar, repita os dados para o cliente e peça a confirmação dele." };
  let req;
  try {
    req = montarRequisicao(f, args);
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "dados inválidos" };
  }
  if (f.nivel === "registrar" && opts.teste) return { ok: true, simulado: true, dados: { nota: "Em teste, ações que gravam não são enviadas de verdade." } };
  try {
    const url = await urlPublicaSegura(req.url);
    const r = await fetch(url, {
      method: req.metodo,
      headers: { accept: "application/json", ...(req.corpo ? { "content-type": "application/json" } : {}), ...f.cabecalhos, ...(await credencial(orgId, f.id)) },
      body: req.corpo,
      redirect: "error",
      signal: AbortSignal.timeout(6000),
    });
    const texto = await r.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = { texto: texto.slice(0, 500) };
    }
    if (!r.ok) return { ok: false, status: r.status, erro: r.status === 401 || r.status === 403 ? "O sistema recusou a credencial" : r.status === 404 ? "Não encontrado" : `Erro ${r.status}` };
    return { ok: true, status: r.status, dados: filtrarResposta(json, f.campos), ...(opts.paraDono ? { camposDisponiveis: listarCampos(json) } : {}) };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return { ok: false, erro: /timeout|abort/i.test(m) ? "O sistema demorou para responder" : m.slice(0, 160) };
  }
}
