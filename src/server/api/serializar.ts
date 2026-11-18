import "server-only";
import type { schema } from "@/db/client";

export function serializar(c: typeof schema.conversas.$inferSelect) {
  return {
    id: c.id,
    agente_id: c.agenteId,
    canal: c.canal,
    de: c.de,
    status: c.status,
    resultado: c.resultado,
    resumo: c.resumo,
    dados: c.dados,
    sentimento: c.sentimento,
    duracao_s: c.duracaoS,
    minutos_cobrados: c.minutosCobrados,
    iniciada_em: c.iniciadaEm,
    encerrada_em: c.encerradaEm,
  };
}
