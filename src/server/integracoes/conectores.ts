import "server-only";
import { urlPublicaSegura } from "@/server/crawler/seguranca";

/**
 * Adapters for connectors the customer links with their own token or webhook (no platform app
 * needed). Each one can `testar` the credential and `enviar` an event (a finished call or a case
 * handed to the team) to the customer's tool.
 */
export type Credenciais = Record<string, string>;

export interface Evento {
  tipo: "ligacao.encerrada" | "repasse.criado" | "teste";
  titulo: string;
  texto: string;
  contato: { nome?: string | null; telefone?: string | null };
  urgencia?: "baixa" | "media" | "alta";
  resultado?: string | null;
  quando: string; // ISO
  dados?: Record<string, string>;
  link?: string;
}

export class ErroConector extends Error {
  constructor(
    msg: string,
    readonly status = 0,
  ) {
    super(msg);
  }
}

export interface Adaptador {
  /** Validates the credential; returns a label for the connected account. */
  testar(c: Credenciais): Promise<string>;
  /** Sends one event; returns a short reference of what was created. */
  enviar(c: Credenciais, e: Evento): Promise<string>;
}

async function req<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let r: Response;
  try {
    r = await fetch(url, {
      ...rest,
      headers: { accept: "application/json", ...(json !== undefined ? { "content-type": "application/json" } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new ErroConector(`Sem resposta do serviço (${e instanceof Error ? e.name : "rede"})`);
  }
  const texto = await r.text();
  if (!r.ok) {
    const msg = r.status === 401 || r.status === 403 ? "Credencial recusada pelo serviço" : `Erro ${r.status}`;
    throw new ErroConector(`${msg}: ${texto.slice(0, 160)}`, r.status);
  }
  try {
    return (texto ? JSON.parse(texto) : {}) as T;
  } catch {
    return texto as T;
  }
}

const so = (t?: string | null) => (t ?? "").replace(/[^\d+]/g, "");
const nomeOu = (e: Evento) => e.contato.nome?.trim() || (e.contato.telefone ? `Cliente ${e.contato.telefone}` : "Cliente da recepcionista");
/** Accepts "empresa" or "empresa.kommo.com" / "empresa.zendesk.com" (with or without https://). */
const subdominio = (s: string) => {
  const v = (s ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/\.(kommo|zendesk)\.com$/, "");
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(v)) throw new ErroConector("Subdomínio inválido: use só o nome da conta (ex.: suaempresa)");
  return v;
};
const corpoNota = (e: Evento) =>
  [e.titulo, "", e.texto, e.resultado ? `Resultado: ${e.resultado}` : "", e.urgencia ? `Urgência: ${e.urgencia}` : "", ...Object.entries(e.dados ?? {}).map(([k, v]) => `${k}: ${v}`), e.link ? `Ver na Recepta: ${e.link}` : ""]
    .filter((l) => l !== "")
    .join("\n");

/* ───────── HubSpot (Private App token) ───────── */
const HS = "https://api.hubapi.com";
const hubspot: Adaptador = {
  async testar(c) {
    const r = await req<{ portalId?: number; uiDomain?: string }>(`${HS}/account-info/v3/details`, { headers: { authorization: `Bearer ${c.token}` } });
    return r.portalId ? `Portal ${r.portalId}` : "Conta HubSpot";
  },
  async enviar(c, e) {
    const h = { authorization: `Bearer ${c.token}` };
    const tel = so(e.contato.telefone);
    let contatoId: string | undefined;
    if (tel) {
      const busca = await req<{ results: { id: string }[] }>(`${HS}/crm/v3/objects/contacts/search`, {
        method: "POST",
        headers: h,
        json: { filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: tel }] }], limit: 1 },
      });
      contatoId = busca.results[0]?.id;
    }
    if (!contatoId) {
      const [primeiro, ...resto] = nomeOu(e).split(" ");
      const novo = await req<{ id: string }>(`${HS}/crm/v3/objects/contacts`, { method: "POST", headers: h, json: { properties: { firstname: primeiro, lastname: resto.join(" "), phone: tel } } });
      contatoId = novo.id;
    }
    const nota = await req<{ id: string }>(`${HS}/crm/v3/objects/notes`, {
      method: "POST",
      headers: h,
      json: {
        properties: { hs_timestamp: e.quando, hs_note_body: corpoNota(e).replace(/\n/g, "<br>") },
        associations: [{ to: { id: contatoId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
      },
    });
    return `contato ${contatoId}, nota ${nota.id}`;
  },
};

/* ───────── Pipedrive (personal API token) ───────── */
const PD = "https://api.pipedrive.com/v1";
const pipedrive: Adaptador = {
  async testar(c) {
    const r = await req<{ data: { name: string; company_name?: string } }>(`${PD}/users/me?api_token=${encodeURIComponent(c.token)}`);
    return r.data.company_name ? `${r.data.company_name} (${r.data.name})` : r.data.name;
  },
  async enviar(c, e) {
    const q = `api_token=${encodeURIComponent(c.token)}`;
    const tel = so(e.contato.telefone);
    let pessoaId: number | undefined;
    if (tel) {
      const b = await req<{ data: { items: { item: { id: number } }[] } }>(`${PD}/persons/search?${q}&term=${encodeURIComponent(tel)}&fields=phone&exact_match=false&limit=1`);
      pessoaId = b.data?.items?.[0]?.item.id;
    }
    if (!pessoaId) pessoaId = (await req<{ data: { id: number } }>(`${PD}/persons?${q}`, { method: "POST", json: { name: nomeOu(e), phone: tel ? [{ value: tel, primary: true, label: "work" }] : undefined } })).data.id;
    let negocio: number | undefined;
    if (e.tipo === "repasse.criado") negocio = (await req<{ data: { id: number } }>(`${PD}/deals?${q}`, { method: "POST", json: { title: e.titulo.slice(0, 250), person_id: pessoaId } })).data.id;
    const nota = await req<{ data: { id: number } }>(`${PD}/notes?${q}`, { method: "POST", json: { content: corpoNota(e).replace(/\n/g, "<br>"), person_id: pessoaId, ...(negocio ? { deal_id: negocio } : {}) } });
    return `pessoa ${pessoaId}${negocio ? `, negócio ${negocio}` : ""}, nota ${nota.data.id}`;
  },
};

/* ───────── RD Station CRM (instance token) ───────── */
const RD = "https://crm.rdstation.com/api/v1";
const rdStation: Adaptador = {
  async testar(c) {
    const r = await req<{ users?: { name: string }[]; total?: number }>(`${RD}/users?token=${encodeURIComponent(c.token)}`);
    return `${r.users?.length ?? r.total ?? 0} usuário(s) no CRM`;
  },
  async enviar(c, e) {
    const q = `token=${encodeURIComponent(c.token)}`;
    const tel = so(e.contato.telefone);
    const negocio = await req<{ id?: string; _id?: string }>(`${RD}/deals?${q}`, {
      method: "POST",
      json: { deal: { name: e.titulo.slice(0, 200) }, contacts: [{ name: nomeOu(e), ...(tel ? { phones: [{ phone: tel }] } : {}) }] },
    });
    const id = negocio.id ?? negocio._id;
    if (id) await req(`${RD}/activities?${q}`, { method: "POST", json: { activity: { deal_id: id, text: corpoNota(e) } } });
    return `negociação ${id ?? "criada"}`;
  },
};

/* ───────── Kommo (long-lived token) ───────── */
const kommo: Adaptador = {
  async testar(c) {
    const r = await req<{ name: string; subdomain: string }>(`https://${subdominio(c.subdominio)}.kommo.com/api/v4/account`, { headers: { authorization: `Bearer ${c.token}` } });
    return `${r.name} (${r.subdomain}.kommo.com)`;
  },
  async enviar(c, e) {
    const base = `https://${subdominio(c.subdominio)}.kommo.com/api/v4`;
    const h = { authorization: `Bearer ${c.token}` };
    const tel = so(e.contato.telefone);
    const r = await req<{ id: number }[]>(`${base}/leads/complex`, {
      method: "POST",
      headers: h,
      json: [
        {
          name: e.titulo.slice(0, 250),
          _embedded: { contacts: [{ first_name: nomeOu(e), ...(tel ? { custom_fields_values: [{ field_code: "PHONE", values: [{ value: tel, enum_code: "WORK" }] }] } : {}) }] },
        },
      ],
    });
    const lead = r[0]?.id;
    if (lead) await req(`${base}/leads/${lead}/notes`, { method: "POST", headers: h, json: [{ note_type: "common", params: { text: corpoNota(e) } }] });
    return `lead ${lead}`;
  },
};

/* ───────── Zendesk (email/token) ───────── */
const zendesk: Adaptador = {
  async testar(c) {
    const r = await req<{ user: { name: string; role: string } }>(`https://${subdominio(c.subdominio)}.zendesk.com/api/v2/users/me.json`, {
      headers: { authorization: `Basic ${Buffer.from(`${c.email}/token:${c.token}`).toString("base64")}` },
    });
    if (r.user.role === "end-user") throw new ErroConector("Credencial recusada: o e-mail precisa ser de um agente");
    return `${r.user.name} (${c.subdominio}.zendesk.com)`;
  },
  async enviar(c, e) {
    const prioridade = { alta: "high", media: "normal", baixa: "low" } as const;
    const r = await req<{ ticket: { id: number } }>(`https://${subdominio(c.subdominio)}.zendesk.com/api/v2/tickets.json`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${c.email}/token:${c.token}`).toString("base64")}` },
      json: {
        ticket: {
          subject: e.titulo.slice(0, 250),
          comment: { body: corpoNota(e), public: false },
          priority: prioridade[e.urgencia ?? "media"],
          tags: ["recepta", e.tipo === "repasse.criado" ? "repasse" : "ligacao"],
        },
      },
    });
    return `ticket #${r.ticket.id}`;
  },
};

/* ───────── WhatsApp Cloud API (permanent token + phone number id) ───────── */
const GRAPH = "https://graph.facebook.com/v21.0";
export const whatsapp: Adaptador & { mensagem(c: Credenciais, para: string, texto: string): Promise<string> } = {
  async testar(c) {
    const r = await req<{ display_phone_number?: string; verified_name?: string }>(`${GRAPH}/${encodeURIComponent(c.phoneId)}?fields=display_phone_number,verified_name`, {
      headers: { authorization: `Bearer ${c.token}` },
    });
    return `${r.verified_name ?? "Número"} ${r.display_phone_number ?? ""}`.trim();
  },
  async mensagem(c, para, texto) {
    const r = await req<{ messages?: { id: string }[] }>(`${GRAPH}/${encodeURIComponent(c.phoneId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${c.token}` },
      json: { messaging_product: "whatsapp", to: so(para).replace(/^\+/, ""), type: "text", text: { body: texto.slice(0, 4000) } },
    });
    return r.messages?.[0]?.id ?? "enviada";
  },
  async enviar() {
    return "sem sincronização (usado para mensagens)";
  },
};

/* ───────── Twilio (Account SID + Auth Token) ───────── */
export const twilio: Adaptador = {
  async testar(c) {
    if (!/^AC[0-9a-f]{32}$/i.test(c.accountSid ?? "")) throw new ErroConector("O Account SID começa com AC e tem 34 caracteres");
    const r = await req<{ friendly_name: string; status: string }>(`https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}.json`, {
      headers: { authorization: `Basic ${Buffer.from(`${c.accountSid}:${c.authToken}`).toString("base64")}` },
    });
    if (r.status !== "active") throw new ErroConector(`Conta Twilio ${r.status}`);
    return r.friendly_name;
  },
  async enviar() {
    return "sem sincronização (usado para telefonia)";
  },
};

/* ───────── Make / n8n (webhook) ───────── */
const webhook: Adaptador = {
  async testar(c) {
    await webhook.enviar(c, { tipo: "teste", titulo: "Teste de conexão da Recepta", texto: "Se chegou, está funcionando.", contato: {}, quando: new Date().toISOString() });
    return new URL(c.url).host;
  },
  async enviar(c, e) {
    const url = await urlPublicaSegura(c.url);
    await req(url.toString(), { method: "POST", json: { origem: "recepta", ...e } });
    return "entregue";
  },
};

export const ADAPTADORES: Record<string, Adaptador> = { hubspot, pipedrive, rd_station: rdStation, kommo, zendesk, whatsapp, twilio, make: webhook, n8n: webhook };

/** OAuth connectors register themselves here (avoids a circular import with ./oauth). */
export function registrarAdaptador(id: string, a: Adaptador) {
  ADAPTADORES[id] = a;
}

/** Connectors that receive call/hand-off events. */
export const SINCRONIZAM = ["hubspot", "pipedrive", "rd_station", "kommo", "zendesk", "make", "n8n", "salesforce", "google_sheets"];
