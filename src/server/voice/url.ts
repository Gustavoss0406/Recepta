import "server-only";

/**
 * Voice WebSocket base URL for browsers. Single-port deploys (scripts/servidor-unico.mjs sets
 * VOZ_MESMA_ORIGEM=1) serve it on the site's own host; otherwise the gateway runs on VOICE_PORT.
 */
export function urlVozNavegador(h: Pick<Headers, "get">): string {
  if (process.env.NEXT_PUBLIC_VOICE_URL) return process.env.NEXT_PUBLIC_VOICE_URL;
  const hostCompleto = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") === "https" ? "wss" : "ws";
  if (process.env.VOZ_MESMA_ORIGEM === "1") return `${proto}://${hostCompleto}`;
  return `${proto}://${hostCompleto.split(":")[0]}:${process.env.VOICE_PORT ?? 3100}`;
}
