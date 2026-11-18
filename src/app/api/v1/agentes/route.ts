import { listarAgentes } from "@/server/agent/agentes";
import { naoAutorizado, orgDaChave } from "@/server/auth/api-key";

export async function GET(req: Request) {
  const orgId = await orgDaChave(req);
  if (!orgId) return naoAutorizado();
  const lista = await listarAgentes(orgId);
  return Response.json({
    dados: lista.map((a) => ({ id: a.id, nome: a.nome, nicho: a.nicho, status: a.status, versao_publicada_id: a.versaoPublicadaId, voz: a.rascunho.voz.vozId })),
  });
}
