import { ehNao, norm, type Perfil } from "./perfil";

/** A connection the owner's answers depend on, and why (shown in the conversation and the final checklist). */
export interface ConexaoNecessaria {
  id: string;
  motivo: string;
  /** false = nice to have (the flow works without it). */
  essencial: boolean;
}

const CRMS: [string, RegExp][] = [
  ["kommo", /kommo|amocrm/],
  ["pipedrive", /pipedrive/],
  ["rd_station", /\brd\b|rd station|rdstation/],
  ["hubspot", /hubspot/],
  ["salesforce", /salesforce/],
  ["zendesk", /zendesk/],
  ["google", /planilha|sheets|google/],
];

export function conexoesDoPerfil(p: Perfil): ConexaoNecessaria[] {
  const f = p.campos;
  const out: ConexaoNecessaria[] = [];
  const add = (c: ConexaoNecessaria) => !out.some((x) => x.id === c.id) && out.push(c);
  if (f.confirmacao === "sim") add({ id: "whatsapp", motivo: "Mandar a confirmação e o lembrete dos horários pelo WhatsApp", essencial: true });
  if (f.aviso === "whatsapp" || f.aviso === "ambos") add({ id: "whatsapp", motivo: "Te avisar pelo WhatsApp quando um caso virar pendência", essencial: true });
  if (f.delivery && /whats/i.test(f.delivery)) add({ id: "whatsapp", motivo: "Mandar o link do pedido pelo WhatsApp", essencial: false });
  if (f.sistemas && !ehNao(f.sistemas)) {
    const s = norm(f.sistemas);
    const crm = CRMS.find(([, r]) => r.test(s));
    if (crm) add({ id: crm[0], motivo: crm[0] === "google" ? "Registrar cada ligação na sua planilha" : `Consultar o cadastro e registrar cada atendimento no ${f.sistemas}`, essencial: true });
  }
  if (f.agenda && f.agenda !== "nao") add({ id: "google", motivo: "Sincronizar os horários com o seu Google Agenda (a agenda da Recepta já funciona sem isso)", essencial: false });
  return out;
}
