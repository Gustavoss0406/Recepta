import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exigirSessao } from "@/server/auth/session";
import { primeiroAgente } from "@/server/agent/agentes";
import { PageHeader, Secao } from "@/components/painel/page-header";
import { Desvio } from "@/components/painel/desvio";
import { VoiceTest } from "@/components/painel/voice-test";

export const metadata = { title: "Números e canais" };

export default async function NumerosPage() {
  const s = await exigirSessao();
  const numeros = await getDb().select().from(schema.numeros).where(eq(schema.numeros.orgId, s.org.id));
  const desvio = numeros.find((n) => n.tipo === "desvio") ?? null;
  const agente = await primeiroAgente(s.org.id);
  const twilio = Boolean(process.env.TWILIO_ACCOUNT_SID);
  return (
    <>
      <PageHeader titulo="Números e canais" descricao="Por onde seus clientes falam com a recepcionista." />
      <Secao className="grid gap-8 xl:grid-cols-[1.3fr_1fr]">
        <section>
          <h2 className="text-[0.9375rem] text-ink">Desviar o número atual</h2>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">Recomendado: seus clientes continuam ligando para o número de sempre.</p>
          <Desvio numero={desvio} />
          <h2 className="mt-12 text-[0.9375rem] text-ink">Número novo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {twilio
              ? "Compre um número local com o DDD que preferir."
              : "Disponível quando a conta de telefonia estiver configurada. Números locais no Brasil exigem documentos da empresa (CNPJ e endereço)."}
          </p>
          <button type="button" disabled={!twilio} className="btn btn-sm btn-secondary mt-4 disabled:opacity-40">
            Comprar número
          </button>
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
