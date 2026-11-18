import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { novoBancoDeTeste } from "../../../test/db";
import { schema, type Db } from "@/db/client";
import { criarConta } from "@/server/auth/conta";
import { cifrar } from "@/server/cripto";
import { buscarDisponiveis, comprarNumero, contaTwilio, registrarNumero, tokenDaConta, urlVoz } from "./twilio";

type Chamada = { url: string; init: RequestInit };
function mockFetch(resp: unknown, status = 200) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      chamadas.push({ url: String(url), init });
      return new Response(JSON.stringify(resp), { status });
    }),
  );
  return chamadas;
}

let db: Db;
let orgId: string;
const conta = { sid: "ACplat", token: "tok", origem: "plataforma" as const };
beforeAll(async () => {
  db = await novoBancoDeTeste();
  orgId = (await criarConta({ nome: "Ana", email: "ana-tel@x.com", senha: "senhaforte1", empresa: "Clínica", nicho: "clinica" })).orgId;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RECEPTA_URL_PUBLICA;
});

describe("Números Twilio", () => {
  it("usa a conta do cliente quando conectada e o token certo para cada Account SID", async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACplat";
    process.env.TWILIO_AUTH_TOKEN = "tok-plat";
    expect((await contaTwilio(orgId))?.origem).toBe("plataforma");
    await db.insert(schema.integracoes).values({ orgId, tipo: "twilio", status: "conectado", credenciais: cifrar(JSON.stringify({ accountSid: "ACcli", authToken: "tok-cli" })) });
    expect(await contaTwilio(orgId)).toMatchObject({ sid: "ACcli", origem: "cliente" });
    expect(await tokenDaConta(orgId, "ACcli")).toBe("tok-cli");
    expect(await tokenDaConta(orgId, "ACplat")).toBe("tok-plat");
    expect(await tokenDaConta(orgId, "ACoutro")).toBeNull();
  });

  it("busca por código de área nos EUA e por prefixo no Brasil", async () => {
    let ch = mockFetch({ available_phone_numbers: [{ phone_number: "+18573809965", friendly_name: "(857) 380-9965", locality: "Boston", region: "MA", capabilities: { SMS: true } }] });
    const r = await buscarDisponiveis(conta, { pais: "US", ddd: "857" });
    expect(r[0]).toEqual({ numero: "+18573809965", formatado: "(857) 380-9965", local: "Boston, MA", sms: true });
    expect(ch[0].url).toContain("/AvailablePhoneNumbers/US/Local.json?");
    expect(ch[0].url).toContain("AreaCode=857");
    ch = mockFetch({ available_phone_numbers: [] });
    await buscarDisponiveis(conta, { pais: "BR", ddd: "(11)" });
    expect(decodeURIComponent(ch[0].url)).toContain("Contains=5511*");
  });

  it("compra apontando para a recepcionista só com URL pública https", async () => {
    expect(urlVoz()).toBeNull();
    process.env.RECEPTA_URL_PUBLICA = "https://app.recepta.ai/";
    const ch = mockFetch({ sid: "PN1", phone_number: "+18573809965", friendly_name: "(857) 380-9965", voice_url: "https://app.recepta.ai/api/twilio/voz" }, 201);
    const n = await comprarNumero(conta, "+18573809965");
    const corpo = new URLSearchParams(String(ch[0].init.body));
    expect(corpo.get("VoiceUrl")).toBe("https://app.recepta.ai/api/twilio/voz");
    expect(corpo.get("PhoneNumber")).toBe("+18573809965");
    await registrarNumero(orgId, null, n, true);
    await registrarNumero(orgId, null, n, true); // idempotent
    const linhas = await db.select().from(schema.numeros).where(eq(schema.numeros.e164, "+18573809965"));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ tipo: "proprio", provedorSid: "PN1" });
  });

  it("traduz os erros comuns da Twilio", async () => {
    mockFetch({ code: 21631, message: "Phone Number Requires an Address" }, 400);
    await expect(comprarNumero(conta, "+551149333408")).rejects.toThrow(/cadastro regulatório/);
    await expect(comprarNumero(conta, "11 4933")).rejects.toThrow(/inválido/);
  });
});
