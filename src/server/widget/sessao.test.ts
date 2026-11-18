import { beforeAll, describe, expect, it } from "vitest";
import { novoBancoDeTeste } from "../../../test/db";
import { criarConta } from "@/server/auth/conta";
import { criarAgente, publicar, salvarRascunho } from "@/server/agent/agentes";
import { verificarTokenVoz } from "@/server/voice/token";
import { _limparLimites, abrirSessaoWidget, dominioPermitido, permitir } from "./sessao";

let orgId: string;
let agenteId: string;

beforeAll(async () => {
  await novoBancoDeTeste();
  ({ orgId } = await criarConta({ nome: "Ana", email: "ana@widget.com", senha: "senhaforte1", empresa: "Clínica Widget", nicho: "clinica" }));
  agenteId = (await criarAgente(orgId, "clinica", { nome: "Clínica Widget", cidade: "Campinas" })).id;
});

describe("Widget do site", () => {
  it("domínios: exato, subdomínio, www; lista vazia libera", () => {
    expect(dominioPermitido("clinica.com.br", [])).toBe(true);
    expect(dominioPermitido("www.clinica.com.br", ["clinica.com.br"])).toBe(true);
    expect(dominioPermitido("agenda.clinica.com.br", ["clinica.com.br"])).toBe(true);
    expect(dominioPermitido("clinica.com.br.golpe.com", ["clinica.com.br"])).toBe(false);
    expect(dominioPermitido(null, ["clinica.com.br"])).toBe(false);
  });

  it("limite por janela deslizante", () => {
    _limparLimites();
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(permitir("x", 3, t + i)).toBe(true);
    expect(permitir("x", 3, t + 10)).toBe(false);
    expect(permitir("x", 3, t + 11 * 60_000)).toBe(true);
  });

  it("só abre sessão para agente publicado, ativo e em site autorizado; token do canal widget", async () => {
    _limparLimites();
    expect(await abrirSessaoWidget(agenteId, { ip: "1.1.1.1", host: null })).toMatchObject({ ok: false, status: 404 });
    await publicar(orgId, agenteId, { id: "u", papel: "dono" });
    const ok = await abrirSessaoWidget(agenteId, { ip: "1.1.1.1", host: "qualquer.com" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(verificarTokenVoz(ok.token)).toMatchObject({ orgId, agenteId, canal: "widget" });

    await salvarRascunho(orgId, agenteId, { widget: { cor: "#111111", texto: "Fale", ativo: true, dominios: ["clinica.com.br"] } });
    await publicar(orgId, agenteId, { id: "u", papel: "dono" });
    expect(await abrirSessaoWidget(agenteId, { ip: "1.1.1.2", host: "outro.com" })).toMatchObject({ ok: false, status: 403 });
    expect((await abrirSessaoWidget(agenteId, { ip: "1.1.1.2", host: "www.clinica.com.br" })).ok).toBe(true);

    for (let i = 0; i < 6; i++) await abrirSessaoWidget(agenteId, { ip: "9.9.9.9", host: "clinica.com.br" });
    expect(await abrirSessaoWidget(agenteId, { ip: "9.9.9.9", host: "clinica.com.br" })).toMatchObject({ ok: false, status: 429 });

    await salvarRascunho(orgId, agenteId, { widget: { cor: "#111111", texto: "Fale", ativo: false, dominios: [] } });
    await publicar(orgId, agenteId, { id: "u", papel: "dono" });
    expect(await abrirSessaoWidget(agenteId, { ip: "1.1.1.3", host: "x.com" })).toMatchObject({ ok: false, status: 404 });
  });
});
