import "server-only";
import { and, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { apagarAudio } from "@/server/audio/armazenamento";
import { assinar } from "@/server/integracoes/eventos";
import { urlPublicaSegura } from "@/server/crawler/seguranca";

const MAX_TENTATIVAS = 6;

/** Delivers one webhook with HMAC signature; exponential backoff on failure. */
export async function entregarWebhook(entregaId: string) {
  const db = getDb();
  const [e] = await db.select().from(schema.entregasWebhook).where(eq(schema.entregasWebhook.id, entregaId));
  if (!e || e.status === "entregue") return;
  const [h] = await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, e.webhookId));
  if (!h) return;
  const corpo = JSON.stringify(e.payload);
  const ts = Math.floor(Date.now() / 1000);
  let status = 0;
  try {
    const url = await urlPublicaSegura(h.url);
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-recepta-evento": e.evento,
        "x-recepta-timestamp": String(ts),
        "x-recepta-assinatura": `sha256=${assinar(h.segredo, corpo, ts)}`,
      },
      body: corpo,
      signal: AbortSignal.timeout(10_000),
    });
    status = r.status;
  } catch {
    status = 0;
  }
  const ok = status >= 200 && status < 300;
  const tentativas = e.tentativas + 1;
  await db
    .update(schema.entregasWebhook)
    .set({ status: ok ? "entregue" : tentativas >= MAX_TENTATIVAS ? "falhou" : "pendente", tentativas, respostaStatus: status || null })
    .where(eq(schema.entregasWebhook.id, e.id));
  if (!ok && tentativas < MAX_TENTATIVAS)
    await db.insert(schema.jobs).values({ tipo: "webhook.entregar", payload: { entregaId }, executarEm: new Date(Date.now() + 2 ** tentativas * 30_000) });
}

/** LGPD retention: erase recordings, transcripts and extracted data older than each organization's policy. */
export async function aplicarRetencao(agora = new Date()) {
  const db = getDb();
  const orgs = await db.select().from(schema.organizacoes);
  let total = 0;
  for (const o of orgs) {
    const limiteAudio = new Date(agora.getTime() - o.retencaoAudioDias * 86_400_000);
    const audios = await db
      .select({ id: schema.conversas.id, chave: schema.conversas.audioChave })
      .from(schema.conversas)
      .where(and(eq(schema.conversas.orgId, o.id), lt(schema.conversas.iniciadaEm, limiteAudio), isNotNull(schema.conversas.audioChave)));
    for (const a of audios) {
      await apagarAudio(a.chave!);
      await db.update(schema.conversas).set({ audioChave: null, audioPicos: null }).where(eq(schema.conversas.id, a.id));
      total++;
    }
    const limite = new Date(agora.getTime() - o.retencaoTranscricaoDias * 86_400_000);
    const antigas = await db
      .select({ id: schema.conversas.id })
      .from(schema.conversas)
      .where(and(eq(schema.conversas.orgId, o.id), lt(schema.conversas.iniciadaEm, limite), or(isNotNull(schema.conversas.estado), isNotNull(schema.conversas.dados))));
    if (!antigas.length) continue;
    const ids = antigas.map((a) => a.id);
    await db.delete(schema.turnos).where(inArray(schema.turnos.conversaId, ids));
    await db.update(schema.chamadasFerramenta).set({ args: null, resultado: null }).where(inArray(schema.chamadasFerramenta.conversaId, ids));
    await db.update(schema.conversas).set({ estado: null, dados: null, de: null, resumo: "[expirado pela política de retenção]" }).where(inArray(schema.conversas.id, ids));
    total += ids.length;
  }
  return total;
}

/** Claims due jobs safely across workers (SKIP LOCKED). */
export async function reivindicarJobs(limite = 10) {
  const r = (await getDb().execute(sql`
    update ${schema.jobs} set status = 'rodando', tentativas = tentativas + 1
    where id in (
      select id from ${schema.jobs}
      where status = 'pendente' and executar_em <= now()
      order by executar_em
      limit ${limite}
      for update skip locked
    )
    returning id, tipo, payload`)) as unknown as { rows: unknown[] };
  return r.rows as { id: string; tipo: string; payload: Record<string, unknown> }[];
}
