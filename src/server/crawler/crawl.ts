import "server-only";
import { extrairPagina, type Pagina } from "./extrair";
import { urlPublicaSegura } from "./seguranca";

const UA = "Mozilla/5.0 (compatible; ReceptaBot/1.0; +https://recepta.ai/bot)";

async function baixar(url: string, timeoutMs: number): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: ctrl.signal, redirect: "follow" });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("text/html")) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 3_000_000) return null;
    return new TextDecoder("utf-8").decode(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function bloqueiosRobots(origem: string): Promise<string[]> {
  const txt = await baixarTexto(`${origem}/robots.txt`);
  if (!txt) return [];
  const bloqueios: string[] = [];
  let aplica = false;
  for (const linha of txt.split("\n")) {
    const [k, ...v] = linha.split(":");
    const chave = k.trim().toLowerCase();
    const valor = v.join(":").trim();
    if (chave === "user-agent") aplica = valor === "*" || /recepta/i.test(valor);
    else if (aplica && chave === "disallow" && valor) bloqueios.push(valor);
  }
  return bloqueios;
}

async function baixarTexto(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(5000) });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/** Breadth-first crawl of one site (same origin), polite and bounded. */
export async function rastrearSite(
  entrada: string,
  opts: { maxPaginas?: number; prazoMs?: number; aoProgredir?: (n: number) => void } = {},
): Promise<{ origem: string; paginas: Pagina[] }> {
  const inicio = await urlPublicaSegura(entrada);
  const max = opts.maxPaginas ?? 30;
  const prazo = Date.now() + (opts.prazoMs ?? 45_000);
  const bloqueios = await bloqueiosRobots(inicio.origin);
  const fila = [inicio.toString()];
  const vistos = new Set(fila);
  const paginas: Pagina[] = [];

  while (fila.length && paginas.length < max && Date.now() < prazo) {
    const lote = fila.splice(0, 4);
    const res = await Promise.all(
      lote.map(async (url) => {
        const path = new URL(url).pathname;
        if (bloqueios.some((b) => path.startsWith(b))) return null;
        const html = await baixar(url, 8000);
        return html ? extrairPagina(html, url) : null;
      }),
    );
    for (const p of res) {
      if (!p || paginas.length >= max) continue;
      if (p.texto.length > 80) paginas.push(p);
      opts.aoProgredir?.(paginas.length);
      for (const l of p.links) if (!vistos.has(l)) (vistos.add(l), fila.push(l));
    }
  }
  if (!paginas.length) throw new Error("Não conseguimos ler o site. Confira o endereço ou envie as informações em texto.");
  return { origem: inicio.origin, paginas };
}
