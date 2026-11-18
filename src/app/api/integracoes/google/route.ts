import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exigirPermissao } from "@/server/auth/session";
import { conectarGoogle, googleConfigurado, urlConsentimento } from "@/server/integracoes/google";
import { novoToken } from "@/server/auth/tokens";

/** GET without ?code → start OAuth; with ?code → callback. CSRF-protected by a state cookie. */
export async function GET(req: Request) {
  const s = await exigirPermissao("integracoes");
  const url = new URL(req.url);
  const redirectUri = `${process.env.RECEPTA_URL_PUBLICA ?? url.origin}/api/integracoes/google`;
  const jar = await cookies();
  if (!googleConfigurado()) return NextResponse.redirect(new URL("/painel/integracoes?erro=google_nao_configurado", url));

  const code = url.searchParams.get("code");
  if (!code) {
    const state = novoToken(16);
    jar.set("recepta_oauth", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/api/integracoes" });
    return NextResponse.redirect(urlConsentimento(redirectUri, state));
  }
  if (url.searchParams.get("state") !== jar.get("recepta_oauth")?.value)
    return NextResponse.redirect(new URL("/painel/integracoes?erro=estado_invalido", url));
  jar.delete("recepta_oauth");
  try {
    await conectarGoogle(s.org.id, code, redirectUri);
  } catch {
    return NextResponse.redirect(new URL("/painel/integracoes?erro=google", url));
  }
  return NextResponse.redirect(new URL("/painel/integracoes?conectado=google", url));
}
