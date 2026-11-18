import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { novoBancoDeTeste } from "../../../test/db";
import { getDb, schema } from "@/db/client";
import { criarConta } from "@/server/auth/conta";
import { cifrar } from "@/server/cripto";
import { PERMISSOES_GOOGLE } from "@/lib/integracoes/google-permissoes";
import { agendamentosDoCliente, atualizarEvento, cancelarEvento, criarEvento, importarGoogle, sincronizarEvento } from "./agenda";

let orgId: string;
let orgSemGoogle: string;
const h = (dia: number, hora: number) => new Date(Date.UTC(2030, 0, dia) + (hora + 3) * 3_600_000); // Brasília → UTC, accepts 9.5 = 9:30
const jobs = async () => getDb().select().from(schema.jobs).where(eq(schema.jobs.tipo, "agenda.sincronizar"));
const evento = async (id: string) => (await getDb().select().from(schema.agendaEventos).where(eq(schema.agendaEventos.id, id)))[0];

beforeAll(async () => {
  await novoBancoDeTeste();
  ({ orgId } = await criarConta({ nome: "Ana", email: "ag@x.com", senha: "senhaforte1", empresa: "Clínica", nicho: "clinica" }));
  ({ orgId: orgSemGoogle } = await criarConta({ nome: "Bia", email: "ag2@x.com", senha: "senhaforte1", empresa: "Outra", nicho: "clinica" }));
  await getDb()
    .insert(schema.integracoes)
    .values({ orgId, tipo: "google", status: "conectado", credenciais: cifrar(JSON.stringify({ access_token: "at", expira: Date.now() + 3_600_000, escopos: PERMISSOES_GOOGLE.agenda.escopos })), detalhes: {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("Agenda interna", () => {
  it("sem Google: marca, bloqueia conflito, remarca e cancela só na agenda da Recepta", async () => {
    const e = await criarEvento(orgSemGoogle, { inicio: h(10, 9), fim: h(10, 10), titulo: "Avaliação", clienteNome: "Maria", clienteTelefone: "(19) 99999-1234" });
    expect(e.sincronia).toBe("local");
    await expect(criarEvento(orgSemGoogle, { inicio: h(10, 9), fim: h(10, 9.5), titulo: "Outro" })).rejects.toThrow("horario_ocupado");
    await criarEvento(orgSemGoogle, { inicio: h(10, 9), fim: h(10, 9.5), titulo: "Encaixe" }, { permitirConflito: true });
    expect((await agendamentosDoCliente(orgSemGoogle, "+55 19 99999-1234")).map((a) => a.id)).toEqual([e.id]);
    const r = await atualizarEvento(orgSemGoogle, e.id, { inicio: h(11, 14) });
    expect(r.fim.getTime() - r.inicio.getTime()).toBe(3_600_000); // keeps the duration
    await cancelarEvento(orgSemGoogle, e.id);
    expect(await agendamentosDoCliente(orgSemGoogle, "19999991234")).toEqual([]);
    expect(await jobs()).toHaveLength(0);
  });

  it("com Google: marca na hora mesmo com o Google fora do ar e tenta de novo depois", async () => {
    const e = await criarEvento(orgId, { inicio: h(12, 9), fim: h(12, 10), titulo: "Limpeza", clienteNome: "João" });
    expect(e.sincronia).toBe("pendente");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 503 })));
    await sincronizarEvento({ eventoId: e.id });
    expect((await evento(e.id)).sincronia).toBe("pendente");
    expect((await jobs()).filter((j) => (j.payload as { eventoId: string }).eventoId === e.id).length).toBe(2); // original + retry

    const fetch = vi.fn(async () => Response.json({ id: "g-1" }));
    vi.stubGlobal("fetch", fetch);
    await sincronizarEvento({ eventoId: e.id, tentativa: 1 });
    const ok = await evento(e.id);
    expect(ok).toMatchObject({ sincronia: "ok", googleId: "g-1" });
    const corpo = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(corpo).toMatchObject({ summary: "Limpeza · João", extendedProperties: { private: { receptaId: e.id } } });

    await cancelarEvento(orgId, e.id);
    const del = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", del);
    await sincronizarEvento({ eventoId: e.id });
    expect((del.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe("DELETE");
  });

  it("importa do Google: novo bloqueia horário, movido lá muda aqui, apagado lá cancela aqui", async () => {
    const nosso = await criarEvento(orgId, { inicio: h(13, 9), fim: h(13, 10), titulo: "Consulta", clienteNome: "Ana" });
    await getDb().update(schema.agendaEventos).set({ googleId: "g-nosso", sincronia: "ok" }).where(eq(schema.agendaEventos.id, nosso.id));
    const apagar = await criarEvento(orgId, { inicio: h(14, 9), fim: h(14, 10), titulo: "Retorno" });
    await getDb().update(schema.agendaEventos).set({ googleId: "g-apagar", sincronia: "ok" }).where(eq(schema.agendaEventos.id, apagar.id));
    const fetch = vi.fn(async () =>
      Response.json({
        items: [
          { id: "g-novo", summary: "Dentista do Dr. Paulo", start: { dateTime: h(15, 10).toISOString() }, end: { dateTime: h(15, 11).toISOString() } },
          { id: "g-nosso", summary: "Consulta · Ana", start: { dateTime: h(13, 15).toISOString() }, end: { dateTime: h(13, 16).toISOString() }, extendedProperties: { private: { receptaId: nosso.id } } },
          { id: "g-apagar", status: "cancelled" },
        ],
        nextSyncToken: "tok-1",
      }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await importarGoogle(orgId)).toEqual({ importados: 1, atualizados: 1, cancelados: 1 });
    expect((await evento(nosso.id)).inicio.toISOString()).toBe(h(13, 15).toISOString());
    expect((await evento(apagar.id)).status).toBe("cancelado");
    await expect(criarEvento(orgId, { inicio: h(15, 10), fim: h(15, 10.5), titulo: "x" })).rejects.toThrow("horario_ocupado");

    // next import is incremental
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("syncToken=tok-1") ? Response.json({ items: [], nextSyncToken: "tok-2" }) : new Response("x", { status: 400 }))));
    expect(await importarGoogle(orgId)).toEqual({ importados: 0, atualizados: 0, cancelados: 0 });
  });
});
