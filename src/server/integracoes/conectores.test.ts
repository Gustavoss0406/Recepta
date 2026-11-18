import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { novoBancoDeTeste } from "../../../test/db";
import { schema, type Db } from "@/db/client";
import { criarConta } from "@/server/auth/conta";
import { ADAPTADORES, type Evento } from "./conectores";
import { agendarSincronizacao, conectar, credenciaisDe, enviarSaida, executarSincronizacao, testarConexao } from "./servico";

type Chamada = { url: string; init: RequestInit & { body?: string } };
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
const corpo = (c: Chamada) => JSON.parse(c.init.body ?? "{}");
const ev: Evento = {
  tipo: "repasse.criado",
  titulo: "João: desconto no clareamento",
  texto: "O que o cliente quer: desconto",
  contato: { nome: "João Silva", telefone: "+55 19 99999-1234" },
  urgencia: "alta",
  quando: "2026-11-18T10:00:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("Adaptadores", () => {
  it("HubSpot: busca contato pelo telefone, cria se não existir e associa a nota (tipo 202)", async () => {
    const ch = mockFetch([
      [/contacts\/search/, () => ({ results: [] })],
      [/objects\/contacts$/, () => ({ id: "c9" })],
      [/objects\/notes/, () => ({ id: "n1" })],
    ]);
    expect(await ADAPTADORES.hubspot.enviar({ token: "pat" }, ev)).toBe("contato c9, nota n1");
    expect(ch[0].init.headers).toMatchObject({ authorization: "Bearer pat" });
    expect(corpo(ch[1]).properties).toMatchObject({ firstname: "João", lastname: "Silva", phone: "+5519999991234" });
    expect(corpo(ch[2]).associations[0]).toMatchObject({ to: { id: "c9" }, types: [{ associationTypeId: 202 }] });
  });

  it("Pipedrive: repasse vira negócio ligado à pessoa existente", async () => {
    const ch = mockFetch([
      [/persons\/search/, () => ({ data: { items: [{ item: { id: 7 } }] } })],
      [/\/deals\?/, () => ({ data: { id: 70 } })],
      [/\/notes\?/, () => ({ data: { id: 700 } })],
    ]);
    expect(await ADAPTADORES.pipedrive.enviar({ token: "t" }, ev)).toBe("pessoa 7, negócio 70, nota 700");
    expect(corpo(ch[1])).toEqual({ title: ev.titulo, person_id: 7 });
    expect(corpo(ch[2])).toMatchObject({ person_id: 7, deal_id: 70 });
  });

  it("Zendesk: ticket interno com prioridade e Basic email/token", async () => {
    const ch = mockFetch([[/tickets\.json/, () => ({ ticket: { id: 42 } })]]);
    expect(await ADAPTADORES.zendesk.enviar({ subdominio: "clinica", email: "a@b.com", token: "z" }, ev)).toBe("ticket #42");
    expect(ch[0].url).toBe("https://clinica.zendesk.com/api/v2/tickets.json");
    expect(ch[0].init.headers).toMatchObject({ authorization: `Basic ${Buffer.from("a@b.com/token:z").toString("base64")}` });
    expect(corpo(ch[0]).ticket).toMatchObject({ priority: "high", comment: { public: false }, tags: ["recepta", "repasse"] });
  });

  it("Kommo: lead complexo com telefone e nota; subdomínio malicioso é recusado", async () => {
    const ch = mockFetch([
      [/leads\/complex/, () => [{ id: 5 }]],
      [/leads\/5\/notes/, () => ({})],
    ]);
    expect(await ADAPTADORES.kommo.enviar({ subdominio: "clinica", token: "k" }, ev)).toBe("lead 5");
    expect(corpo(ch[0])[0]._embedded.contacts[0].custom_fields_values[0]).toMatchObject({ field_code: "PHONE" });
    await expect(ADAPTADORES.kommo.testar({ subdominio: "evil.com/x?", token: "k" })).rejects.toThrow(/Subdomínio/);
  });

  it("Twilio: valida o formato do Account SID antes de chamar a API", async () => {
    await expect(ADAPTADORES.twilio.testar({ accountSid: "SKabc", authToken: "x" })).rejects.toThrow(/AC/);
  });

  it("Webhook (Make/n8n): bloqueia endereço interno (SSRF)", async () => {
    await expect(ADAPTADORES.make.enviar({ url: "http://127.0.0.1:5432/x" }, ev)).rejects.toThrow();
  });
});

describe("Serviço de integrações", () => {
  let db: Db;
  let orgId: string;
  beforeAll(async () => {
    db = await novoBancoDeTeste();
    ({ orgId } = await criarConta({ nome: "Ana", email: "ana@int.com", senha: "senhaforte1", empresa: "Clínica Int", nicho: "clinica" }));
  });

  it("conecta só se o serviço aceitar a credencial, guarda criptografado e enfileira eventos", async () => {
    mockFetch([[/users\/me/, () => ({ data: { name: "Ana", company_name: "Clínica" } })]]);
    await expect(conectar(orgId, "pipedrive", { token: "" })).rejects.toThrow(/Preencha/);
    expect(await conectar(orgId, "pipedrive", { token: "segredo123" })).toBe("Clínica (Ana)");
    const [i] = await db.select().from(schema.integracoes).where(and(eq(schema.integracoes.orgId, orgId), eq(schema.integracoes.tipo, "pipedrive")));
    expect(i.credenciais).not.toContain("segredo123");
    expect(await credenciaisDe(orgId, "pipedrive")).toEqual({ token: "segredo123" });

    await agendarSincronizacao(orgId, ev);
    const jobs = await db.select().from(schema.jobs).where(eq(schema.jobs.tipo, "integracao.sincronizar"));
    expect(jobs).toHaveLength(1);
  });

  it("falha temporária reagenda; credencial recusada marca a integração com erro", async () => {
    const [i] = await db.select().from(schema.integracoes).where(eq(schema.integracoes.tipo, "pipedrive"));
    mockFetch([[/persons\/search/, () => ({}), 503]]);
    await executarSincronizacao({ integracaoId: i.id, evento: ev });
    const re = await db.select().from(schema.jobs).where(eq(schema.jobs.tipo, "integracao.sincronizar"));
    expect(re.some((j) => (j.payload as { tentativa?: number }).tentativa === 1)).toBe(true);

    mockFetch([[/persons\/search/, () => ({}), 401]]);
    await executarSincronizacao({ integracaoId: i.id, evento: ev });
    const [depois] = await db.select().from(schema.integracoes).where(eq(schema.integracoes.id, i.id));
    expect(depois.status).toBe("erro");
    expect((depois.detalhes as { historico: { ok: boolean }[] }).historico[0].ok).toBe(false);
    await expect(testarConexao(orgId, "pipedrive")).rejects.toThrow(/não conectada/);
  });

  it("WhatsApp conectado: mensagem sai de verdade; sem conexão fica simulada", async () => {
    const semConexao = await enviarSaida(orgId, { canal: "whatsapp", destino: "+5519999990000", corpo: "oi" });
    expect(semConexao.status).toBe("simulado");
    mockFetch([
      [/fields=display_phone_number/, () => ({ display_phone_number: "+55 19 4000-0000", verified_name: "Clínica" })],
      [/\/messages$/, () => ({ messages: [{ id: "wamid.1" }] })],
    ]);
    await conectar(orgId, "whatsapp", { token: "EAAG", phoneId: "123" });
    const m = await enviarSaida(orgId, { canal: "whatsapp", destino: "+55 19 99999-0000", corpo: "Sua consulta está confirmada" });
    const [linha] = await db.select().from(schema.caixaSaida).where(eq(schema.caixaSaida.id, m.id));
    expect(linha.status).toBe("enviado");
  });
});
