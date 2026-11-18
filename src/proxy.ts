import { NextResponse, type NextRequest } from "next/server";

/** Cheap gate: no session cookie → login. Full validation happens server-side in exigirSessao(). */
export function proxy(req: NextRequest) {
  if (!req.cookies.get("recepta_sessao")) {
    const url = req.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/painel/:path*", "/interno/:path*"] };
