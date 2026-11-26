import "server-only";
import { foto as fotoLocal } from "./local";
import { fotoUnsplash, type FotoUnsplash } from "./unsplash";

export interface Foto {
  src: string;
  credito?: { autor: string; autorUrl: string; pagina: string };
}

/** Best photo for each slot: Unsplash (with credit) when configured, else the project's own file. */
export async function fotos(slugs: string[]): Promise<Record<string, Foto | null>> {
  const pares = await Promise.all(
    slugs.map(async (s): Promise<[string, Foto | null]> => {
      const u: FotoUnsplash | null = await Promise.race([fotoUnsplash(s).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
      if (u) return [s, { src: u.url, credito: { autor: u.autor, autorUrl: u.autorUrl, pagina: u.pagina } }];
      const l = fotoLocal(s);
      return [s, l ? { src: l } : null];
    }),
  );
  return Object.fromEntries(pares);
}
