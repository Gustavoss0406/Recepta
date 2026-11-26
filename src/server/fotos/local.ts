import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";

/** Public URL of a downloaded photo, or null while it isn't there yet. */
export function foto(slug: string): string | null {
  return existsSync(path.join(process.cwd(), "public", "fotos", `${slug}.jpg`)) ? `/fotos/${slug}.jpg` : null;
}
