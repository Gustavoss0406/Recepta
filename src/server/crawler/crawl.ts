import "server-only";
import { extrairPagina, type Pagina } from "./extrair";
import { urlPublicaSegura } from "./seguranca";

const UA = "Mozilla/5.0 (compatible; ReceptaBot/1.0; +https://recepta.ai/bot)";
// some hosts (Cloudflare, Wix, Hostinger) refuse bot user agents: retry as a regular browser
const UA_NAVEGADOR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

async function baixar(url: string, timeoutMs: number): Promise<string | null> {
  for (const ua of [UA, UA_NAVEGADOR]) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { headers: { "user-agent": ua, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "pt-BR,pt;q=0.9" }, signal: ctrl.signal, redirect: "follow" });
      const tipo = r.headers.get("content-type") ?? "";
      if (!r.ok) continue;
      if (tipo && !/html|xml|text\/plain/.test(tipo)) return null;
      const buf = await r.arrayBuffer();
      if (buf.byteLength > 3_000_000) return null;
      const charset = /charset=([\w-]+)/i.exec(tipo)?.[1]?.toLowerCase();
      try {
        return new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8").decode(buf);
      } catch {
        return new TextDecoder("utf-8").decode(buf);
      }
    } catch {
      // timeout / TLS / DNS: try the next user agent, then give up on this URL
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

/**
 * Whatever the owner typed — "Site.com.br/", " https://www.site.com ", "htps//site.com", "site .com.br",
 * "www.site.com.br/contato" — becomes the list of addresses worth trying, best first.
 */
export function candidatosDeSite(raw: string): string[] {
  let t = raw
    .trim()
    .replace(/^["'<(\s]+|["'>),.;!\s]+$/g, "")
    .replace(/^(site|url|endereço|endereco)\s*[:=]?\s*/i, "")
    .replace(/\s+/g, "");
  t = t.replace(/^h?t+p+s?:?\/*/i, (m) => (/s/i.test(m) ? "https://" : "http://"));
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return [];
  }
  const host = u.hostname.toLowerCase().replace(/\.+$/, "");
  if (!host.includes(".")) return [];
  const caminho = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
  const semWww = host.replace(/^www\./, "");
  const hosts = host.startsWith("www.") ? [host, semWww] : [semWww, `www.${semWww}`];
  const lista: string[] = [];
  for (const proto of ["https", "http"]) for (const h of hosts) lista.push(`${proto}://${h}${caminho}${u.search}`);
  if (caminho) for (const proto of ["https", "http"]) for (const h of hosts) lista.push(`${proto}://${h}/`);
  return [...new Set(lista)];
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
  const candidatos = candidatosDeSite(entrada);
  if (!candidatos.length) throw new Error("Não entendi esse endereço. Tente algo como suaempresa.com.br.");
  let ultimoErro: unknown;
  for (const c of candidatos) {
    try {
      return await rastrearDe(c, opts);
    } catch (e) {
      ultimoErro = e;
    }
  }
  throw ultimoErro instanceof Error && /permitido/.test(ultimoErro.message)
    ? ultimoErro
    : new Error("Não conseguimos abrir esse site agora. Confira se ele está no ar ou envie as informações em texto.");
}

async function rastrearDe(
  entrada: string,
  opts: { maxPaginas?: number; prazoMs?: number; aoProgredir?: (n: number) => void },
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
      // the home page counts even when it's thin (sites built with JS still have title + description)
      if (p.texto.length > 80 || (paginas.length === 0 && `${p.titulo} ${p.descricao} ${p.texto}`.trim().length > 15)) paginas.push(p);
      opts.aoProgredir?.(paginas.length);
      for (const l of p.links) if (!vistos.has(l)) (vistos.add(l), fila.push(l));
    }
  }
  if (!paginas.length) throw new Error("Não conseguimos ler o site. Confira o endereço ou envie as informações em texto.");
  return { origem: inicio.origin, paginas };
}
