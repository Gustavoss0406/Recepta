/**
 * Background worker: queued jobs + periodic billing/LGPD tasks.
 * Run: npm run worker   (one or more instances; jobs are claimed with SKIP LOCKED)
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { fecharCiclosVencidos, processarInadimplencia } from "@/server/billing/faturamento";
import { aplicarRetencao, entregarWebhook, reivindicarJobs } from "./tarefas";
import { executarSincronizacao } from "@/server/integracoes/servico";
import { importarTodasAgendas, sincronizarEvento } from "@/server/agenda/agenda";
import { executarSuite } from "@/server/testes/suite";

const HANDLERS: Record<string, (p: Record<string, unknown>) => Promise<unknown>> = {
  "webhook.entregar": (p) => entregarWebhook(String(p.entregaId)),
  "integracao.sincronizar": (p) => executarSincronizacao(p as Parameters<typeof executarSincronizacao>[0]),
  "testes.suite": (p) => executarSuite(String(p.orgId), String(p.agenteId), { rodadas: Number(p.rodadas) || 1 }),
  "agenda.sincronizar": (p) => sincronizarEvento(p as { eventoId: string; tentativa?: number }),
};

async function rodarFila() {
  const jobs = await reivindicarJobs();
  for (const j of jobs) {
    try {
      const h = HANDLERS[j.tipo];
      if (!h) throw new Error(`Job desconhecido: ${j.tipo}`);
      await h(j.payload);
      await getDb().update(schema.jobs).set({ status: "concluido" }).where(eq(schema.jobs.id, j.id));
    } catch (e) {
      await getDb()
        .update(schema.jobs)
        .set({ status: "erro", erro: e instanceof Error ? e.message : String(e) })
        .where(eq(schema.jobs.id, j.id));
    }
  }
}

const periodicas: { nome: string; aCada: number; ultimo: number; f: () => Promise<unknown> }[] = [
  { nome: "faturamento.fechar_ciclos", aCada: 60_000, ultimo: 0, f: () => fecharCiclosVencidos() },
  { nome: "faturamento.inadimplencia", aCada: 10 * 60_000, ultimo: 0, f: () => processarInadimplencia() },
  { nome: "lgpd.retencao", aCada: 60 * 60_000, ultimo: 0, f: () => aplicarRetencao() },
  { nome: "agenda.importar_google", aCada: 5 * 60_000, ultimo: 0, f: () => importarTodasAgendas() },
];

async function ciclo() {
  await rodarFila();
  for (const p of periodicas)
    if (Date.now() - p.ultimo >= p.aCada) {
      p.ultimo = Date.now();
      try {
        const r = await p.f();
        if (r && (Array.isArray(r) ? r.length : typeof r === "number" ? r : Object.values(r).some(Boolean))) console.log(p.nome, JSON.stringify(r).slice(0, 200));
      } catch (e) {
        console.error(p.nome, e);
      }
    }
}

console.log("Worker da Recepta iniciado");
for (;;) {
  await ciclo();
  await new Promise((r) => setTimeout(r, 5000));
}
