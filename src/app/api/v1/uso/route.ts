import { naoAutorizado, orgDaChave } from "@/server/auth/api-key";
import { resumoCobranca } from "@/server/billing/assinaturas";

export async function GET(req: Request) {
  const orgId = await orgDaChave(req);
  if (!orgId) return naoAutorizado();
  const r = await resumoCobranca(orgId);
  return Response.json({
    plano: r.plano.id,
    status: r.assinatura.status,
    ciclo: { inicio: r.assinatura.inicioCiclo, fim: r.assinatura.fimCiclo },
    minutos: { usados: r.usadosFranquia, incluidos: r.incluidos, pico: r.uso.minutosPico, teste: r.uso.minutosTeste },
    parcial_brl: r.parcialCentavos / 100,
    estado: r.estado,
  });
}
