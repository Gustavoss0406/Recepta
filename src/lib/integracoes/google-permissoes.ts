/**
 * Permissions the business grants with a single "Entrar com Google" (incremental consent: each one
 * can be added later without losing the others). Shared by the Integrations screen and the server.
 */
export type PermissaoGoogle = "agenda" | "planilhas" | "gmail";

export const PERMISSOES_GOOGLE: Record<PermissaoGoogle, { rotulo: string; descricao: string; escopos: string[] }> = {
  agenda: {
    rotulo: "Agenda",
    descricao: "Ver os horários livres e criar o evento de cada agendamento.",
    escopos: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.freebusy"],
  },
  planilhas: {
    rotulo: "Planilhas",
    descricao: "Criar a planilha “Recepta · Ligações” e adicionar uma linha por ligação. Só acessa arquivos criados pela Recepta.",
    escopos: ["https://www.googleapis.com/auth/drive.file"],
  },
  gmail: {
    rotulo: "Gmail",
    descricao: "Enviar do seu e-mail os avisos e relatórios dos casos passados à equipe. Não lê sua caixa de entrada.",
    escopos: ["https://www.googleapis.com/auth/gmail.send"],
  },
};

export const ESCOPOS_BASE = ["openid", "email"];

export const PERMISSOES_ORDEM = Object.keys(PERMISSOES_GOOGLE) as PermissaoGoogle[];

export function permissoesDe(escopos: string[] = []): PermissaoGoogle[] {
  return PERMISSOES_ORDEM.filter((p) => PERMISSOES_GOOGLE[p].escopos.every((e) => escopos.includes(e)));
}

export function lerPermissoes(valores: string[]): PermissaoGoogle[] {
  const v = valores.flatMap((x) => x.split(",")).map((x) => x.trim());
  const ok = PERMISSOES_ORDEM.filter((p) => v.includes(p));
  return ok.length ? ok : PERMISSOES_ORDEM;
}
