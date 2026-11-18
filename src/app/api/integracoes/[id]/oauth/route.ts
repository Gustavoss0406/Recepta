import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exigirPermissao } from "@/server/auth/session";
import { novoToken } from "@/server/auth/tokens";
import { concluirOAuth, OAUTH, oauthConfigurado, urlAutorizacao } from "@/server/integracoes/oauth";

/** GET without ?code → redirect to the vendor consent screen; with ?code → callback. CSRF: state cookie per connector. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await exigirPermissao("integracoes");
  const { id } = await params;
  const url = new URL(req.url);
  if (!OAUTH[id]) return NextResponse.redirect(new URL("/painel/integracoes?erro=desconhecida", url));
  if (!oauthConfigurado(id)) return NextResponse.redirect(new URL(`/painel/integracoes?erro=app_nao_configurado&id=${id}`, url));
  const redirectUri = `${process.env.RECEPTA_URL_PUBLICA ?? url.origin}/api/integracoes/${id}/oauth`;
  const jar = await cookies();
  const nome = `recepta_oauth_${id}`;
  const code = url.searchParams.get("code");
  if (!code) {
    const state = novoToken(16);
    jar.set(nome, state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/api/integracoes" });
    return NextResponse.redirect(urlAutorizacao(id, redirectUri, state));
  }
  if (url.searchParams.get("state") !== jar.get(nome)?.value) return NextResponse.redirect(new URL("/painel/integracoes?erro=estado_invalido", url));
  jar.delete(nome);
  try {
    await concluirOAuth(s.org.id, id, code, redirectUri);
  } catch {
    return NextResponse.redirect(new URL(`/painel/integracoes?erro=autorizacao&id=${id}`, url));
  }
  return NextResponse.redirect(new URL(`/painel/integracoes?conectado=${id}`, url));
}
