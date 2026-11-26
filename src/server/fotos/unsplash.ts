import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

/**
 * Interface photos from Unsplash, following their API guidelines: images are hotlinked from
 * images.unsplash.com, the download endpoint is pinged when a photo is first used, and every photo
 * shows "Foto de <autor> no Unsplash". Needs UNSPLASH_ACCESS_KEY (only the Access Key; the Secret Key
 * is for user login, which we don't use). Results are cached for 30 days.
 */
export interface FotoUnsplash {
  url: string;
  autor: string;
  autorUrl: string;
  pagina: string;
  alt: string;
}

export const BUSCAS_UNSPLASH: Record<string, string> = {
  clinica: "medical clinic receptionist",
  imobiliaria: "real estate agent house keys",
  restaurante: "restaurant dining room",
  oficina: "car mechanic workshop",
  petshop: "dog grooming",
  salao: "hair salon stylist",
  advocacia: "law office",
  academia: "gym workout",
  veterinaria: "veterinarian dog",
  escola: "classroom students",
  atendimento: "woman smiling on phone",
  headset: "customer service headset",
  recepcao: "office reception desk",
  "cidade-noite": "city lights night",
  equipe: "team meeting office",
};

const UTM = "utm_source=recepta&utm_medium=referral";
const DIAS_CACHE = 30;
const memoria = new Map<string, { quando: number; foto: FotoUnsplash | null }>();

async function api(caminho: string) {
  const r = await fetch(`https://api.unsplash.com${caminho}`, {
    headers: { authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, "accept-version": "v1" },
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`Unsplash ${r.status}`);
  return r.json();
}

async function buscar(slug: string): Promise<FotoUnsplash | null> {
  const q = BUSCAS_UNSPLASH[slug];
  if (!q) return null;
  const j = (await api(`/search/photos?query=${encodeURIComponent(q)}&orientation=landscape&per_page=10&content_filter=high`)) as {
    results: { urls: { raw: string }; user: { name: string; links: { html: string } }; links: { html: string; download_location: string }; alt_description: string | null }[];
  };
  const f = j.results[0];
  if (!f) return null;
  // guideline: register the use of the photo
  void api(f.links.download_location.replace("https://api.unsplash.com", "")).catch(() => {});
  return {
    url: `${f.urls.raw}&w=1400&q=75&fm=jpg&fit=crop`,
    autor: f.user.name,
    autorUrl: `${f.user.links.html}?${UTM}`,
    pagina: `https://unsplash.com/?${UTM}`,
    alt: f.alt_description ?? "",
  };
}

/** Unsplash photo for a slot, or null (no key, nothing found, or Unsplash unavailable). */
export async function fotoUnsplash(slug: string): Promise<FotoUnsplash | null> {
  if (!process.env.UNSPLASH_ACCESS_KEY) return null;
  const m = memoria.get(slug);
  if (m && Date.now() - m.quando < 6 * 3600_000) return m.foto;
  const db = getDb();
  const [c] = await db.select().from(schema.fotosCache).where(eq(schema.fotosCache.slug, slug));
  if (c && Date.now() - c.atualizadoEm.getTime() < DIAS_CACHE * 86_400_000) {
    memoria.set(slug, { quando: Date.now(), foto: c.dados });
    return c.dados;
  }
  try {
    const foto = await buscar(slug);
    await db
      .insert(schema.fotosCache)
      .values({ slug, dados: foto })
      .onConflictDoUpdate({ target: schema.fotosCache.slug, set: { dados: foto, atualizadoEm: new Date() } });
    memoria.set(slug, { quando: Date.now(), foto });
    return foto;
  } catch {
    return c?.dados ?? null; // keep the old one if Unsplash is down or rate-limited
  }
}
