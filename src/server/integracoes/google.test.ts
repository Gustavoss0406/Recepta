import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { novoBancoDeTeste } from "../../../test/db";
import { schema, type Db } from "@/db/client";
import { criarConta } from "@/server/auth/conta";
import { cifrar, decifrar } from "@/server/cripto";
import { lerPermissoes, permissoesDe, PERMISSOES_GOOGLE } from "@/lib/integracoes/google-permissoes";
import { conectarGoogle, criarEventoGoogle, desconectarGoogle, enviarGmail, mensagemGmail, urlConsentimento } from "./google";
import { ADAPTADORES } from "./conectores";
import { enviarSaida, executarSincronizacao } from "./servico";

type Chamada = { url: string; init: RequestInit & { body?: string | URLSearchParams } };
function mockFetch(rotas: [RegExp, (c: Chamada) => unknown, number?][]) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const c = { url: String(url), init: init as Chamada["init"] };
      chamadas.push(c);
      const r = rotas.find(([re]) => re.test(c.url));
      if (!r) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify(r[1](c)), { status: r[2] ?? 200 });
    }),
  );
  return chamadas;
}
const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;
const todos = Object.values(PERMISSOES_GOOGLE).flatMap((p) => p.escopos);

let db: Db;
let orgId: string;
beforeAll(async () => {
  db = await novoBancoDeTeste();
  process.env.GOOGLE_CLIENT_ID = "cid";
  process.env.GOOGLE_CLIENT_SECRET = "sec";
  orgId = (await criarConta({ nome: "Ana", email: "ana-google@clinica.com", senha: "segredo-forte-123", empresa: "Clínica", nicho: "clinica" })).orgId;
});
afterEach(() => vi.unstubAllGlobals());

describe("Permissões do Google", () => {
  it("lê as permissões pedidas (padrão: todas) e as concedidas pelos escopos", () => {
    expect(lerPermissoes(["agenda,gmail"])).toEqual(["agenda", "gmail"]);
    expect(lerPermissoes(["xyz"])).toEqual(["agenda", "planilhas", "gmail"]);
    expect(permissoesDe(PERMISSOES_GOOGLE.agenda.escopos)).toEqual(["agenda"]);
    expect(permissoesDe(["https://www.googleapis.com/auth/calendar.events"])).toEqual([]); // partial grant
  });

  it("URL de consentimento é incremental, offline e só com os escopos escolhidos", () => {
    const u = new URL(urlConsentimento("https://app/cb", "st", ["gmail"]));
    expect(u.searchParams.get("include_granted_scopes")).toBe("true");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/gmail.send");
  });

  it("monta o e-mail com assunto UTF-8 e recusa quebra de linha nos cabeçalhos", () => {
    const raw = Buffer.from(mensagemGmail("ana@x.com", "Pendência: João", "Olá"), "base64url").toString();
    expect(raw).toContain("To: ana@x.com");
    expect(raw).toContain(`Subject: =?UTF-8?B?${Buffer.from("Pendência: João").toString("base64")}?=`);
    expect(() => mensagemGmail("a@x.com\r\nBcc: b@y.com", "x", "y")).toThrow();
  });
});

describe("Conexão Google", () => {
  it("conecta, soma permissões em um segundo consentimento e mantém o refresh token", async () => {
    mockFetch([[/oauth2\.googleapis\.com\/token/, () => ({ access_token: "a1", refresh_token: "r1", expires_in: 3600, scope: `openid email ${PERMISSOES_GOOGLE.agenda.escopos.join(" ")}`, id_token: idToken("dono@clinica.com") })]]);
    expect(await conectarGoogle(orgId, "code1", "https://app/cb")).toEqual(["agenda"]);
    mockFetch([[/oauth2\.googleapis\.com\/token/, () => ({ access_token: "a2", expires_in: 3600, scope: PERMISSOES_GOOGLE.gmail.escopos.join(" ") })]]);
    expect(await conectarGoogle(orgId, "code2", "https://app/cb")).toEqual(["agenda", "gmail"]);
    const [i] = await db.select().from(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, "google")));
    const t = JSON.parse(decifrar(i.credenciais!));
    expect(t.refresh_token).toBe("r1");
    expect(i.detalhes).toMatchObject({ conta: "dono@clinica.com", permissoes: ["agenda", "gmail"] });
  });

  it("Agenda e Gmail usam o token; sem a permissão de planilhas a sincronização é ignorada", async () => {
    const ch = mockFetch([
      [/calendars\/primary\/events/, () => ({ id: "ev1" })],
      [/gmail\/v1\/users\/me\/messages\/send/, () => ({ id: "msg1" })],
    ]);
    expect(await criarEventoGoogle(orgId, { titulo: "Consulta", descricao: "", inicio: new Date(), fim: new Date() })).toBe("ev1");
    expect(await enviarGmail(orgId, "equipe@clinica.com", "Pendência", "Ligar para João")).toBe("msg1");
    expect(ch.every((c) => (c.init.headers as Record<string, string>).authorization === "Bearer a2")).toBe(true);
    const [i] = await db.select().from(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, "google")));
    expect(await ADAPTADORES.google.enviar(JSON.parse(decifrar(i.credenciais!)), { tipo: "teste", titulo: "t", texto: "x", contato: {}, quando: "" })).toMatch(/ignorado/);
  });

  it("e-mail da caixa de saída sai pelo Gmail quando há permissão", async () => {
    mockFetch([[/messages\/send/, () => ({ id: "msg2" })]]);
    const l = await enviarSaida(orgId, { canal: "email", destino: "equipe@clinica.com", assunto: "Aviso", corpo: "Oi" });
    const [m] = await db.select().from(schema.caixaSaida).where(eq(schema.caixaSaida.id, l.id));
    expect(m.status).toBe("enviado");
  });

  it("token vencido é renovado e salvo; planilha é criada na primeira ligação", async () => {
    const [i] = await db.select().from(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, "google")));
    const t = JSON.parse(decifrar(i.credenciais!));
    await db
      .update(schema.integracoes)
      .set({ credenciais: cifrar(JSON.stringify({ ...t, expira: 0, escopos: todos })) })
      .where(eq(schema.integracoes.id, i.id));
    const ch = mockFetch([
      [/oauth2\.googleapis\.com\/token/, () => ({ access_token: "a3", expires_in: 3600 })],
      [/spreadsheets$/, () => ({ spreadsheetId: "plan1" })],
      [/values\/A1:append/, () => ({})],
    ]);
    await executarSincronizacao({ integracaoId: i.id, evento: { tipo: "ligacao.encerrada", titulo: "Agendou", texto: "ok", contato: { telefone: "+5511" }, quando: "2026-11-18" } });
    const [depois] = await db.select().from(schema.integracoes).where(eq(schema.integracoes.id, i.id));
    const novo = JSON.parse(decifrar(depois.credenciais!));
    expect(novo).toMatchObject({ access_token: "a3", refresh_token: "r1", planilhaId: "plan1" });
    expect(ch.filter((c) => /append/.test(c.url))).toHaveLength(2); // header + call row
    expect((depois.detalhes as { historico: { ok: boolean }[] }).historico[0].ok).toBe(true);
  });

  it("desconectar revoga o acesso no Google e apaga a conexão", async () => {
    const ch = mockFetch([[/oauth2\.googleapis\.com\/revoke/, () => ({})]]);
    await desconectarGoogle(orgId);
    expect(ch[0].url).toContain("token=r1");
    expect(await db.select().from(schema.integracoes).where(eq(schema.integracoes.orgId, orgId))).toHaveLength(0);
  });
});

describe("Entrar com Pipedrive / HubSpot", () => {
  it("Pipedrive: troca o código com Basic, usa Bearer no api_domain da empresa e renova o token", async () => {
    process.env.PIPEDRIVE_CLIENT_ID = "pid";
    process.env.PIPEDRIVE_CLIENT_SECRET = "psec";
    const { concluirOAuth } = await import("./oauth");
    let ch = mockFetch([
      [/oauth\.pipedrive\.com\/oauth\/token/, () => ({ access_token: "pa1", refresh_token: "pr1", expires_in: 3600, api_domain: "https://acme.pipedrive.com" })],
      [/acme\.pipedrive\.com\/api\/v1\/users\/me/, () => ({ data: { name: "Ana", company_name: "Acme" } })],
    ]);
    await concluirOAuth(orgId, "pipedrive", "code", "https://app/cb");
    expect((ch[0].init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("pid:psec").toString("base64")}`);
    expect(String(ch[0].init.body)).not.toContain("client_secret");
    const [i] = await db.select().from(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, "pipedrive")));
    expect(i.detalhes).toMatchObject({ conta: "Acme (Ana)" });

    const cred = JSON.parse(decifrar(i.credenciais!));
    cred.expira = 0;
    ch = mockFetch([
      [/oauth\.pipedrive\.com\/oauth\/token/, () => ({ access_token: "pa2", expires_in: 3600 })],
      [/persons\/search/, () => ({ data: { items: [{ item: { id: 7 } }] } })],
      [/\/deals/, () => ({ data: { id: 8 } })],
      [/\/notes/, () => ({ data: { id: 9 } })],
    ]);
    const ref = await ADAPTADORES.pipedrive.enviar(cred, { tipo: "repasse.criado", titulo: "Caso", texto: "x", contato: { telefone: "+55 11 9999" }, quando: "" });
    expect(ref).toBe("pessoa 7, negócio 8, nota 9");
    const api = ch.filter((c) => c.url.startsWith("https://acme.pipedrive.com/api/v1/"));
    expect(api).toHaveLength(3);
    expect(api.every((c) => (c.init.headers as Record<string, string>).authorization === "Bearer pa2" && !c.url.includes("api_token"))).toBe(true);
    expect(cred).toMatchObject({ access_token: "pa2", refresh_token: "pr1", api_domain: "https://acme.pipedrive.com" });
  });

  it("HubSpot com token de app privado continua funcionando sem OAuth", async () => {
    const ch = mockFetch([[/account-info/, () => ({ portalId: 42 })]]);
    expect(await ADAPTADORES.hubspot.testar({ token: "pat-1" })).toBe("Portal 42");
    expect((ch[0].init.headers as Record<string, string>).authorization).toBe("Bearer pat-1");
  });
});
