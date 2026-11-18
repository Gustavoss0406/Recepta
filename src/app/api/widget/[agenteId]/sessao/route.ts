import { abrirSessaoWidget } from "@/server/widget/sessao";
import { urlVozNavegador } from "@/server/voice/url";

/** Public: issues a 60-second voice token for one website-widget conversation. */
export async function POST(req: Request, { params }: { params: Promise<{ agenteId: string }> }) {
  const { agenteId } = await params;
  const corpo = (await req.json().catch(() => ({}))) as { host?: unknown };
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const host = typeof corpo.host === "string" ? corpo.host.slice(0, 253) : null;
  const r = await abrirSessaoWidget(agenteId, { ip, host });
  if (!r.ok) return Response.json({ erro: r.erro }, { status: r.status, headers: { "cache-control": "no-store" } });
  const url = urlVozNavegador(req.headers);
  return Response.json({ token: r.token, url, agente: r.agente }, { headers: { "cache-control": "no-store" } });
}
