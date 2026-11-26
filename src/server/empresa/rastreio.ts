import "server-only";
import { and, eq } from "drizzle-orm";
import { parse } from "node-html-parser";
import { getDb, schema } from "@/db/client";
import { adicionarTexto, removerFonte } from "@/server/agent/conhecimento";
import { candidatosDeSite } from "@/server/crawler/crawl";
import { urlPublicaSegura } from "@/server/crawler/seguranca";

/**
 * Everything public we can learn about a company once the owner links a site, an Instagram or just
 * says the name and city: the site's own structured data and social links, the Instagram profile,
 * Google Business data (when a Places key is configured) and what the web says about it. The result
 * becomes a knowledge source ("Perfil público da empresa") the receptionist uses on calls.
 */
export interface EntradaRastreio {
  nome?: string;
  cidade?: string;
  site?: string;
  instagram?: string;
}

export interface PerfilPublico {
  nome?: string;
  descricao?: string;
  telefones: string[];
  emails: string[];
  whatsapp: string[];
  endereco?: string;
  horarios?: string[];
  faixaPreco?: string;
  avaliacao?: { nota: number; total: number; fonte: string };
  redes: Record<string, string>;
  instagram?: { usuario: string; nome?: string; bio?: string; seguidores?: string; publicacoes?: string; categoria?: string; link?: string };
  google?: { nome?: string; endereco?: string; telefone?: string; site?: string; mapa?: string; nota?: number; avaliacoes?: number; horarios?: string[]; comentarios: string[] };
  web: { titulo: string; trecho: string; url: string }[];
  fontes: string[];
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const uniq = <T,>(xs: T[]) => [...new Set(xs.filter(Boolean))];

async function baixar(url: string, extra: Record<string, string> = {}, ms = 9000): Promise<string | null> {
  try {
    await urlPublicaSegura(url);
    const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9", ...extra }, redirect: "follow", signal: AbortSignal.timeout(ms) });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/** "@lar.imoveis", "instagram.com/lar.imoveis/", "https://www.instagram.com/lar.imoveis?igsh=…" → "lar.imoveis". */
export function usuarioInstagram(t?: string): string | null {
  if (!t) return null;
  const m = /instagram\.com\/([A-Za-z0-9._]{1,30})/i.exec(t) ?? /(?:^|\s)@([A-Za-z0-9._]{2,30})\b/.exec(t) ?? /^([A-Za-z0-9._]{2,30})$/.exec(t.trim());
  const u = m?.[1]?.replace(/\.$/, "");
  return u && !["p", "reel", "explore", "stories"].includes(u.toLowerCase()) ? u : null;
}

const TELEFONE = /(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s.]?\d{4}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g;

/** Contacts, social links and schema.org data from the site's own pages. */
export function lerSite(html: string, base: string): Partial<PerfilPublico> {
  const root = parse(html);
  const redes: Record<string, string> = {};
  const whatsapp: string[] = [];
  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    const rede = /instagram\.com|facebook\.com|linkedin\.com|tiktok\.com|youtube\.com|x\.com|twitter\.com|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|g\.page/i.exec(href)?.[0];
    if (rede) redes[rede.split(".")[0].replace(/^maps$/, "google_maps").replace(/^g$/, "google_maps")] ??= href;
    const wa = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp:\/\/send\?phone=)(\d{10,13})/i.exec(href)?.[1];
    if (wa) whatsapp.push(wa);
  }
  const texto = root.text;
  const telefones = uniq([...(texto.match(TELEFONE) ?? []), ...root.querySelectorAll('a[href^="tel:"]').map((a) => (a.getAttribute("href") ?? "").slice(4))].map((x) => x.replace(/[^\d+]/g, ""))).filter((x) => x.length >= 10).slice(0, 5);
  const emails = uniq([...(texto.match(EMAIL) ?? []), ...root.querySelectorAll('a[href^="mailto:"]').map((a) => (a.getAttribute("href") ?? "").slice(7).split("?")[0])])
    .filter((e) => !/\.(png|jpe?g|webp|svg|gif)$/i.test(e) && !/sentry|wixpress|example/i.test(e))
    .slice(0, 5);
  const out: Partial<PerfilPublico> = { redes, whatsapp: uniq(whatsapp), telefones, emails, fontes: [base] };
  // schema.org LocalBusiness / Organization (address, hours, rating, price range)
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const dados = JSON.parse(s.text);
      const itens = (Array.isArray(dados) ? dados : dados["@graph"] ?? [dados]) as Record<string, unknown>[];
      for (const d of itens) {
        const tipo = String(d["@type"] ?? "");
        if (!/Organization|Business|Store|Restaurant|RealEstate|Dentist|Medical|Clinic|Agent|Service|Place/i.test(tipo)) continue;
        out.nome ??= d.name as string | undefined;
        out.descricao ??= d.description as string | undefined;
        const end = d.address as Record<string, string> | string | undefined;
        if (end) out.endereco ??= typeof end === "string" ? end : [end.streetAddress, end.addressLocality, end.addressRegion, end.postalCode].filter(Boolean).join(", ");
        if (d.telephone) out.telefones = uniq([String(d.telephone).replace(/[^\d+]/g, ""), ...(out.telefones ?? [])]);
        if (d.priceRange) out.faixaPreco ??= String(d.priceRange);
        const h = d.openingHours ?? d.openingHoursSpecification;
        if (h) out.horarios ??= (Array.isArray(h) ? h : [h]).map((x) => (typeof x === "string" ? x : `${[x.dayOfWeek].flat().join(", ")} ${x.opens}–${x.closes}`));
        const r = d.aggregateRating as Record<string, string> | undefined;
        if (r?.ratingValue) out.avaliacao ??= { nota: Number(r.ratingValue), total: Number(r.reviewCount ?? r.ratingCount ?? 0), fonte: "site" };
        for (const l of [d.sameAs].flat().filter(Boolean) as string[]) {
          const k = /instagram|facebook|linkedin|tiktok|youtube/i.exec(l)?.[0]?.toLowerCase();
          if (k) out.redes![k] ??= l;
        }
      }
    } catch {
      // malformed JSON-LD is common; ignore
    }
  }
  return out;
}

/** Public Instagram profile page (the same preview tags a link preview reads). Best effort: Instagram often hides them. */
export async function lerInstagram(usuario: string): Promise<PerfilPublico["instagram"]> {
  const perfil: NonNullable<PerfilPublico["instagram"]> = { usuario };
  const html = await baixar(`https://www.instagram.com/${encodeURIComponent(usuario)}/`);
  if (!html) return perfil;
  const root = parse(html);
  const meta = (p: string) => root.querySelector(`meta[property="${p}"]`)?.getAttribute("content") ?? root.querySelector(`meta[name="${p}"]`)?.getAttribute("content") ?? "";
  const desc = meta("og:description") || meta("description");
  const m = /([\d.,]+[kKmM]?)\s*(?:Followers|seguidores).*?([\d.,]+[kKmM]?)\s*(?:Posts|publica)/i.exec(desc);
  if (m) [perfil.seguidores, perfil.publicacoes] = [m[1], m[2]];
  const titulo = meta("og:title");
  perfil.nome = /^(.*?)\s*\(@/.exec(titulo)?.[1] || undefined;
  const bio = /on Instagram:\s*"(.*)"$/s.exec(desc)?.[1] ?? /-\s*(.+)$/.exec(desc)?.[1];
  if (bio && !/See Instagram photos/i.test(bio)) perfil.bio = bio.trim();
  return perfil;
}

/** Google Business profile via Places API (New) — only when GOOGLE_PLACES_API_KEY is configured. */
export async function lerGoogle(consulta: string): Promise<PerfilPublico["google"] | undefined> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return undefined;
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": key,
        "x-goog-fieldmask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.regularOpeningHours.weekdayDescriptions,places.reviews",
      },
      body: JSON.stringify({ textQuery: consulta, languageCode: "pt-BR", regionCode: "BR", maxResultCount: 1 }),
      signal: AbortSignal.timeout(9000),
    });
    const p = r.ok ? (await r.json()).places?.[0] : null;
    if (!p) return undefined;
    return {
      nome: p.displayName?.text,
      endereco: p.formattedAddress,
      telefone: p.nationalPhoneNumber,
      site: p.websiteUri,
      mapa: p.googleMapsUri,
      nota: p.rating,
      avaliacoes: p.userRatingCount,
      horarios: p.regularOpeningHours?.weekdayDescriptions,
      comentarios: ((p.reviews ?? []) as { text?: { text?: string }; rating?: number }[]).slice(0, 5).map((x) => `${x.rating ?? "?"}★ ${x.text?.text ?? ""}`.slice(0, 300)),
    };
  } catch {
    return undefined;
  }
}

/**
 * What the web says about the company (titles, snippets, links). Uses the official Brave Search API
 * when BRAVE_SEARCH_API_KEY is configured; otherwise DuckDuckGo's public HTML results.
 */
export async function buscarNaWeb(consulta: string, max = 6): Promise<PerfilPublico["web"]> {
  const brave = process.env.BRAVE_SEARCH_API_KEY;
  if (brave) {
    try {
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(consulta)}&country=BR&search_lang=pt-br&count=${max}`, {
        headers: { accept: "application/json", "x-subscription-token": brave },
        signal: AbortSignal.timeout(9000),
      });
      if (r.ok) {
        const j = (await r.json()) as { web?: { results?: { title: string; description: string; url: string }[] } };
        return (j.web?.results ?? []).slice(0, max).map((x) => ({ titulo: x.title, trecho: x.description.replace(/<[^>]+>/g, ""), url: x.url }));
      }
    } catch {
      // fall back to the public results page
    }
  }
  const html = await baixar(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(consulta)}&kl=br-pt`);
  if (!html) return [];
  const root = parse(html);
  return root
    .querySelectorAll(".result")
    .map((r) => {
      const a = r.querySelector("a.result__a");
      let url = a?.getAttribute("href") ?? "";
      const real = /uddg=([^&]+)/.exec(url)?.[1];
      if (real) url = decodeURIComponent(real);
      return { titulo: a?.text.trim() ?? "", trecho: r.querySelector(".result__snippet")?.text.trim() ?? "", url };
    })
    .filter((x) => x.titulo && x.url && !/duckduckgo\.com\/y\.js|ad_provider/.test(x.url))
    .slice(0, max);
}

export async function rastrearEmpresa(e: EntradaRastreio): Promise<PerfilPublico> {
  const p: PerfilPublico = { telefones: [], emails: [], whatsapp: [], redes: {}, web: [], fontes: [] };
  const consulta = [e.nome, e.cidade].filter(Boolean).join(" ");

  // 1. the site itself (any format the owner typed)
  if (e.site) {
    for (const url of candidatosDeSite(e.site).slice(0, 4)) {
      const html = await baixar(url);
      if (!html) continue;
      const s = lerSite(html, url);
      Object.assign(p, { ...s, telefones: uniq([...(s.telefones ?? []), ...p.telefones]), emails: uniq([...(s.emails ?? []), ...p.emails]), redes: { ...s.redes, ...p.redes }, fontes: uniq([...p.fontes, url]) });
      break;
    }
  }

  // 2. Instagram (typed by the owner, or found on the site), Google and the web — in parallel
  const usuario = usuarioInstagram(e.instagram) ?? usuarioInstagram(p.redes.instagram);
  const [ig, google, web, webInsta] = await Promise.all([
    usuario ? lerInstagram(usuario) : Promise.resolve(undefined),
    consulta ? lerGoogle(consulta) : Promise.resolve(undefined),
    consulta ? buscarNaWeb(`"${e.nome}" ${e.cidade ?? ""}`) : Promise.resolve([]),
    consulta && !usuario ? buscarNaWeb(`${consulta} instagram`, 3) : Promise.resolve([]),
  ]);
  p.instagram = ig;
  if (ig) p.fontes.push(`https://www.instagram.com/${ig.usuario}/`);
  if (!ig) {
    const achado = webInsta.map((w) => usuarioInstagram(w.url)).find(Boolean);
    if (achado) {
      p.instagram = await lerInstagram(achado);
      p.fontes.push(`https://www.instagram.com/${achado}/`);
    }
  }
  if (google) {
    p.google = google;
    p.endereco ??= google.endereco;
    p.horarios ??= google.horarios;
    if (google.nota) p.avaliacao = { nota: google.nota, total: google.avaliacoes ?? 0, fonte: "Google" };
    if (google.telefone) p.telefones = uniq([...p.telefones, google.telefone.replace(/[^\d+]/g, "")]);
    if (google.mapa) p.fontes.push(google.mapa);
  }
  p.web = web;
  p.fontes = uniq([...p.fontes, ...web.map((w) => w.url)]);
  p.nome ??= google?.nome ?? ig?.nome ?? e.nome;
  return p;
}

/** Human-readable summary the receptionist can search during calls. */
export function textoDoPerfil(p: PerfilPublico): string {
  const l: string[] = [`Perfil público da empresa ${p.nome ?? ""} (reunido automaticamente da internet).`];
  if (p.descricao) l.push(`Sobre: ${p.descricao}`);
  if (p.endereco) l.push(`Endereço: ${p.endereco}`);
  if (p.telefones.length) l.push(`Telefones: ${p.telefones.join(", ")}`);
  if (p.whatsapp.length) l.push(`WhatsApp: ${p.whatsapp.join(", ")}`);
  if (p.emails.length) l.push(`E-mails: ${p.emails.join(", ")}`);
  if (p.horarios?.length) l.push(`Horários: ${p.horarios.join("; ")}`);
  if (p.faixaPreco) l.push(`Faixa de preço: ${p.faixaPreco}`);
  if (p.avaliacao) l.push(`Avaliação: ${p.avaliacao.nota} de 5 (${p.avaliacao.total} avaliações no ${p.avaliacao.fonte})`);
  if (p.instagram) {
    const i = p.instagram;
    l.push(`Instagram: @${i.usuario}${i.nome ? ` (${i.nome})` : ""}${i.seguidores ? `, ${i.seguidores} seguidores` : ""}${i.categoria ? `, ${i.categoria}` : ""}.${i.bio ? ` Bio: ${i.bio}` : ""}`);
  }
  for (const [k, v] of Object.entries(p.redes)) if (k !== "instagram") l.push(`${k}: ${v}`);
  if (p.google?.comentarios.length) l.push(`O que clientes dizem no Google:\n${p.google.comentarios.map((c) => `- ${c}`).join("\n")}`);
  if (p.web.length) l.push(`Na internet:\n${p.web.map((w) => `- ${w.titulo}: ${w.trecho}`).join("\n")}`);
  return l.join("\n");
}

export const TITULO_PERFIL = "Perfil público da empresa (internet)";

/** Runs the sweep and replaces the agent's previous public-profile knowledge source. */
export async function rastrearEGuardar(orgId: string, agenteId: string, e: EntradaRastreio) {
  const perfil = await rastrearEmpresa(e);
  const antigas = await getDb()
    .select({ id: schema.fontesConhecimento.id })
    .from(schema.fontesConhecimento)
    .where(and(eq(schema.fontesConhecimento.agenteId, agenteId), eq(schema.fontesConhecimento.titulo, TITULO_PERFIL)));
  for (const a of antigas) await removerFonte(orgId, a.id);
  await adicionarTexto(orgId, agenteId, TITULO_PERFIL, textoDoPerfil(perfil));
  return perfil;
}
