import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { configParaConversa } from "@/server/agent/agentes";
import { getVoice } from "@/lib/voices";
import { WidgetCliente } from "./widget-cliente";

export const metadata = { title: "Atendimento", robots: { index: false } };

/** Embedded by public/widget.js in an iframe on the customer's website. System font only (Satoshi is not licensed for third-party sites). */
export default async function WidgetPage({ params }: { params: Promise<{ agenteId: string }> }) {
  const { agenteId } = await params;
  const [a] = await getDb().select().from(schema.agentes).where(eq(schema.agentes.id, agenteId));
  if (!a?.versaoPublicadaId || a.status !== "publicado") notFound();
  const { config } = await configParaConversa(a.orgId, a.id, "publicado");
  if (!config.widget.ativo) notFound();
  return (
    <WidgetCliente
      agenteId={a.id}
      empresa={config.empresa.nome}
      nome={config.comportamento.nomeAgente}
      tom={getVoice(config.voz.vozId)?.tone ?? "padrao"}
    />
  );
}
