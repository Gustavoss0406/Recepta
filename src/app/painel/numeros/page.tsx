import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exigirSessao } from "@/server/auth/session";
import { primeiroAgente } from "@/server/agent/agentes";
import { PageHeader, Secao } from "@/components/painel/page-header";
import { Desvio } from "@/components/painel/desvio";
import { VoiceTest } from "@/components/painel/voice-test";
import { NumerosTwilio, type NumeroLivre } from "@/components/painel/numeros-twilio";
import { contaTwilio, numerosDaConta, urlVoz } from "@/server/telefonia/twilio";

export const metadata = { title: "Números e canais" };

export default async function NumerosPage() {
  const s = await exigirSessao();
  const numeros = await getDb().select().from(schema.numeros).where(eq(schema.numeros.orgId, s.org.id));
  const desvio = numeros.find((n) => n.tipo === "desvio") ?? null;
  const agente = await primeiroAgente(s.org.id);
  const proprios = numeros.filter((n) => n.tipo === "proprio");
  const conta = await contaTwilio(s.org.id);
  // numbers already in the customer's own Twilio account that the receptionist doesn't use yet
  let livres: NumeroLivre[] = [];
  if (conta?.origem === "cliente")
    livres = await numerosDaConta(conta)
      .then((l) => l.filter((x) => !proprios.some((p) => p.e164 === x.numero)))
      .catch(() => []);
  return (
    <>
      <PageHeader titulo="Números e canais" descricao="Por onde seus clientes falam com a recepcionista." />
      <Secao className="grid gap-8 xl:grid-cols-[1.3fr_1fr]">
        <section>
          <h2 className="text-[0.9375rem] text-ink">Desviar o número atual</h2>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">Recomendado: seus clientes continuam ligando para o número de sempre.</p>
          <Desvio numero={desvio} />
          <h2 className="mt-12 text-[0.9375rem] text-ink">Número exclusivo</h2>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">Um número só da recepcionista, para divulgar ou para receber o desvio.</p>
          <NumerosTwilio
            origem={conta?.origem ?? null}
            proprios={proprios.map((n) => ({ id: n.id, e164: n.e164, apontado: Boolean(n.verificadoEm) }))}
            livres={livres}
            urlPublica={Boolean(urlVoz())}
          />
        </section>
        <section className="flex h-[620px] flex-col overflow-hidden rounded-[16px] bg-strong">
          <div className="border-b border-hairline px-4 py-3">
            <p className="text-sm text-ink">Simulador de ligação</p>
            <p className="text-xs text-muted-foreground">Simula uma ligação recebida na versão publicada, pelo mesmo pipeline de voz do telefone. Conta nos 60 min de teste grátis.</p>
          </div>
          {agente?.versaoPublicadaId ? <VoiceTest agenteId={agente.id} canal="simulador" /> : <p className="p-6 text-sm text-muted-foreground">Publique o agente para simular ligações.</p>}
        </section>
      </Secao>
    </>
  );
}
