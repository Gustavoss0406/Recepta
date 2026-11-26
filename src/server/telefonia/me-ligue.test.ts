import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { telefoneE164 } from "./me-ligue";
import { assinarTokenVoz, verificarTokenVoz } from "@/server/voice/token";

describe("Me ligue agora", () => {
  it.each([
    ["(11) 98765-4321", "+5511987654321"],
    ["11987654321", "+5511987654321"],
    ["011 98765 4321", "+5511987654321"],
    ["+55 (19) 3232-1000", "+551932321000"],
    ["5519998765432", "+5519998765432"],
    ["+1 415 555 0100", "+14155550100"],
    ["98765-4321", null],
    ["abc", null],
  ])("%s → %s", (e, r) => expect(telefoneE164(e)).toBe(r));

  describe("webhook", () => {
    const env = { ...process.env };
    beforeEach(() => {
      process.env.RECEPTA_URL_PUBLICA = "https://recepta.exemplo";
      process.env.TWILIO_ACCOUNT_SID = "AC123";
      process.env.TWILIO_AUTH_TOKEN = "segredo-twilio";
      process.env.VOZ_MESMA_ORIGEM = "1";
    });
    afterEach(() => {
      process.env = { ...env };
      vi.resetModules();
    });

    async function chamar(token: string, assinar = true) {
      vi.doMock("@/server/telefonia/twilio", () => ({ tokenDaConta: async () => "segredo-twilio" }));
      const { POST } = await import("@/app/api/twilio/me-ligue/route");
      const url = `https://recepta.exemplo/api/twilio/me-ligue?t=${encodeURIComponent(token)}`;
      const params = { AccountSid: "AC123", CallSid: "CA1", From: "+5511900000000", To: "+5511987654321" };
      const assinatura = createHmac("sha1", "segredo-twilio").update(url + Object.keys(params).sort().map((k) => k + params[k as keyof typeof params]).join("")).digest("base64");
      const corpo = new URLSearchParams(params);
      return POST(new Request(url, { method: "POST", body: corpo, headers: { "content-type": "application/x-www-form-urlencoded", ...(assinar ? { "x-twilio-signature": assinatura } : {}) } }));
    }

    it("conecta a ligação atendida à recepcionista (rascunho, canal me_ligue)", async () => {
      const r = await chamar(assinarTokenVoz({ orgId: "o1", agenteId: "a1", canal: "me_ligue", de: "+5511987654321" }));
      expect(r.status).toBe(200);
      const xml = await r.text();
      expect(xml).toContain('<Stream url="wss://recepta.exemplo/twilio">');
      const t = verificarTokenVoz(/value="([^"]+)"/.exec(xml)![1]);
      expect(t).toMatchObject({ orgId: "o1", agenteId: "a1", canal: "me_ligue", de: "+5511987654321" });
    });

    it("recusa sem a assinatura da Twilio", async () => {
      const r = await chamar(assinarTokenVoz({ orgId: "o1", agenteId: "a1", canal: "me_ligue" }), false);
      expect(r.status).toBe(403);
    });

    it("link expirado ou de outro canal só avisa e desliga", async () => {
      const r = await chamar(assinarTokenVoz({ orgId: "o1", agenteId: "a1", canal: "telefone" }));
      expect(await r.text()).toContain("<Hangup/>");
    });
  });
});
