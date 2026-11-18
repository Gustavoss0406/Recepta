import "server-only";
import type { EstruturadoReq, Llm, TurnoReq, TurnoRes, UsoLlm } from "./llm";
import { ErroProvedor, estruturadoOpenAI, turnoOpenAI, type EndpointOpenAI } from "./llm-openai";

/**
 * Free LLM rotation for production. Candidates (provider × model) are tried in order; each
 * failure puts the candidate or the whole provider in cooldown:
 *  - 429 per minute → provider pauses for Retry-After (or 30 s)
 *  - daily quota / 402 → provider pauses until the next UTC day (or 1 h)
 *  - 5xx, timeout, malformed tool call → that model pauses for 2 min
 * When every candidate is down, `ErroSemMotor` lets the runtime fall back to a scripted
 * hand-off ("I'll pass your request to the team") instead of dropping the call.
 */
export class ErroSemMotor extends Error {
  constructor(readonly tentativas: string[]) {
    super(`Nenhum motor disponível (${tentativas.join("; ").slice(0, 400)})`);
  }
}

export interface Provedor {
  id: string;
  baseURL: string;
  chave: string;
  modelos: () => Promise<string[]>;
  timeoutMs: number;
  extraHeaders?: Record<string, string>;
}

type Estado = { ate: number; motivo: string };
const g = globalThis as unknown as { __receptaPausas?: Map<string, Estado>; __receptaStats?: Map<string, { ok: number; falha: number; ultimoMs: number }> };
const pausas = (g.__receptaPausas ??= new Map());
const stats = (g.__receptaStats ??= new Map());

function proximoDiaUtc(agora: number) {
  const d = new Date(agora);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) + 60_000;
}

/** How long to stop using a provider or model after an error (exported for tests). */
export function classificarErro(e: unknown, agora = Date.now()): { escopo: "provedor" | "modelo"; ate: number; motivo: string } {
  if (e instanceof ErroProvedor) {
    const msg = e.message.toLowerCase();
    // Aggregators (OpenRouter) report a single saturated upstream model as 429 "provider returned error".
    const doModelo = /(provider returned error|upstream|temporarily rate-limited)/.test(msg);
    if (e.status === 429 && /(per day|daily|rpd|tokens per day|free-models-per-day|quota)/.test(msg)) return { escopo: "provedor", ate: proximoDiaUtc(agora), motivo: "cota diária" };
    if (e.status === 429 && doModelo) return { escopo: "modelo", ate: agora + (e.tentarDepoisMs ?? 60_000), motivo: "modelo saturado" };
    if (e.status === 429) return { escopo: "provedor", ate: agora + (e.tentarDepoisMs ?? 30_000), motivo: "limite por minuto" };
    if (e.status === 402) return { escopo: "provedor", ate: agora + 3_600_000, motivo: "sem saldo/limite" };
    if (e.status === 401 || (e.status === 403 && /(key|auth|unauthori|credential)/.test(msg))) return { escopo: "provedor", ate: agora + 3_600_000, motivo: "credencial" };
    if (e.status === 403) return { escopo: "modelo", ate: agora + 6 * 3_600_000, motivo: "modelo bloqueado para esta conta/região" };
    if (e.status === 404 || e.status === 400) return { escopo: "modelo", ate: agora + 3_600_000, motivo: `modelo indisponível (${e.status})` };
  }
  return { escopo: "modelo", ate: agora + 120_000, motivo: e instanceof Error ? e.message.slice(0, 80) : "falha" };
}

export class LlmRotativo implements Llm {
  readonly real = true;
  readonly gratuito = true;
  /** Which provider/model answered the last call (for logs and the cost ledger). */
  ultimo: string | null = null;

  constructor(
    private provedores: Provedor[],
    private opts: { maxTentativas?: number; agora?: () => number } = {},
  ) {}

  private async candidatos(): Promise<{ p: Provedor; modelo: string }[]> {
    const agora = (this.opts.agora ?? Date.now)();
    const lista: { p: Provedor; modelo: string }[] = [];
    for (const p of this.provedores) {
      if ((pausas.get(p.id)?.ate ?? 0) > agora) continue;
      let modelos: string[] = [];
      try {
        modelos = await p.modelos();
      } catch {
        continue;
      }
      for (const m of modelos) if ((pausas.get(`${p.id}/${m}`)?.ate ?? 0) <= agora) lista.push({ p, modelo: m });
    }
    return lista;
  }

  private async rodar<R>(fn: (e: EndpointOpenAI) => Promise<R>): Promise<R> {
    const tentativas: string[] = [];
    const cands = await this.candidatos();
    let usadas = 0;
    for (const { p, modelo } of cands) {
      if (usadas >= (this.opts.maxTentativas ?? 4)) break;
      const chave = `${p.id}/${modelo}`;
      const agora = (this.opts.agora ?? Date.now)();
      // A failure earlier in this same call may have paused the whole provider.
      if ((pausas.get(p.id)?.ate ?? 0) > agora || (pausas.get(chave)?.ate ?? 0) > agora) continue;
      usadas++;
      const t0 = Date.now();
      try {
        const r = await fn({ nome: chave, baseURL: p.baseURL, modelo, chave: p.chave, timeoutMs: p.timeoutMs, extraHeaders: p.extraHeaders });
        const s = stats.get(chave) ?? { ok: 0, falha: 0, ultimoMs: 0 };
        stats.set(chave, { ...s, ok: s.ok + 1, ultimoMs: Date.now() - t0 });
        this.ultimo = chave;
        return r;
      } catch (e) {
        const c = classificarErro(e, (this.opts.agora ?? Date.now)());
        pausas.set(c.escopo === "provedor" ? p.id : chave, { ate: c.ate, motivo: c.motivo });
        const s = stats.get(chave) ?? { ok: 0, falha: 0, ultimoMs: 0 };
        stats.set(chave, { ...s, falha: s.falha + 1 });
        tentativas.push(`${chave}: ${c.motivo}`);
      }
    }
    throw new ErroSemMotor(tentativas.length ? tentativas : ["todos os provedores em pausa"]);
  }

  turno(req: TurnoReq): Promise<TurnoRes> {
    return this.rodar((e) => turnoOpenAI(e, req));
  }

  estruturado<T>(req: EstruturadoReq<T>): Promise<{ dados: T; uso: UsoLlm }> {
    return this.rodar((e) => estruturadoOpenAI(e, req));
  }
}

/** Health snapshot for the internal admin page. */
export function estadoRotacao() {
  const agora = Date.now();
  return {
    pausas: [...pausas.entries()].filter(([, v]) => v.ate > agora).map(([k, v]) => ({ alvo: k, motivo: v.motivo, ate: new Date(v.ate).toISOString() })),
    stats: [...stats.entries()].map(([k, v]) => ({ alvo: k, ...v })),
  };
}

export function _limparRotacao() {
  pausas.clear();
  stats.clear();
}

/* ───────── Default provider chain (env-configurable) ───────── */

const lista = (v: string | undefined, padrao: string[]) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : padrao);

/** Preference among OpenRouter ":free" models that support tools (others follow in API order). */
/** Order from the live PT-BR benchmark (scripts/bench-llm.ts): tool calling + latency. */
const PREFERIDOS_OPENROUTER = ["nvidia/nemotron-3.5-super-vl:free", "nvidia/nemotron-3.5-lightning:free", "google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"];
const EXCLUIR_OPENROUTER = /(code|1\.7b|nano|preview|note|ling-|inkling)/i;
let cacheOR: { ate: number; modelos: string[] } | null = null;

async function modelosOpenRouter(): Promise<string[]> {
  const fixos = process.env.OPENROUTER_MODELOS;
  if (fixos) return lista(fixos, []);
  if (cacheOR && cacheOR.ate > Date.now()) return cacheOR.modelos;
  const r = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(5000) });
  const d = (await r.json()) as { data: { id: string; supported_parameters?: string[] }[] };
  const livres = d.data.filter((m) => m.id.endsWith(":free") && m.supported_parameters?.includes("tools") && !EXCLUIR_OPENROUTER.test(m.id)).map((m) => m.id);
  const ordem = [...PREFERIDOS_OPENROUTER.filter((m) => livres.includes(m)), ...livres.filter((m) => !PREFERIDOS_OPENROUTER.includes(m))].slice(0, 6);
  cacheOR = { ate: Date.now() + 6 * 3_600_000, modelos: ordem };
  return ordem;
}

export function provedoresPadrao(): Provedor[] {
  const p: Provedor[] = [];
  const ordem = lista(process.env.LLM_PROVEDORES, ["groq", "openrouter"]);
  for (const id of ordem) {
    if (id === "groq" && process.env.GROQ_API_KEY)
      p.push({
        id,
        baseURL: "https://api.groq.com/openai/v1",
        chave: process.env.GROQ_API_KEY,
        modelos: async () => lista(process.env.GROQ_MODELOS, ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]),
        timeoutMs: 8000,
      });
    if (id === "openrouter" && process.env.OPENROUTER_API_KEY)
      p.push({
        id,
        baseURL: "https://openrouter.ai/api/v1",
        chave: process.env.OPENROUTER_API_KEY,
        modelos: modelosOpenRouter,
        timeoutMs: 12000,
        extraHeaders: { "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://recepta.app", "X-Title": "Recepta" },
      });
    // Any other OpenAI-compatible server (self-hosted vLLM, a paid provider): LLM_<ID>_URL / _KEY / _MODELOS
    const url = process.env[`LLM_${id.toUpperCase()}_URL`];
    if (url)
      p.push({
        id,
        baseURL: url,
        chave: process.env[`LLM_${id.toUpperCase()}_KEY`] ?? "none",
        modelos: async () => lista(process.env[`LLM_${id.toUpperCase()}_MODELOS`], []),
        timeoutMs: 10000,
      });
  }
  return p;
}
