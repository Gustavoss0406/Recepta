/**
 * Connector catalog (shared by the Integrations screen and the server adapters).
 * Logos are the vendors' own marks (simple-icons, CC0 data, or the vendors' published icons),
 * used only to identify the integration.
 */
export type Categoria = "telefonia" | "mensagens" | "agenda" | "crm" | "atendimento" | "automacao" | "planilhas";
export type Auth = "token" | "oauth" | "webhook";

export interface Campo {
  nome: string;
  rotulo: string;
  tipo?: "text" | "password" | "url" | "email";
  placeholder?: string;
  ajuda?: string;
}

export interface Conector {
  id: string;
  nome: string;
  logo: string;
  categoria: Categoria;
  auth: Auth;
  descricao: string;
  /** What the receptionist does with it, in plain words. */
  faz: string[];
  campos?: Campo[];
  /** Where the customer gets the credential (shown in the connect sheet). */
  comoObter?: string;
  /** OAuth: env prefix for the platform app (CLIENT_ID / CLIENT_SECRET). */
  oauthEnv?: string;
}

const SEGREDO = "password" as const;

export const CONECTORES: Conector[] = [
  {
    id: "google_agenda",
    nome: "Google Agenda",
    logo: "/integracoes/google_agenda.svg",
    categoria: "agenda",
    auth: "oauth",
    oauthEnv: "GOOGLE",
    descricao: "Consulta horários livres e cria os eventos na sua agenda.",
    faz: ["Mostra só horários livres de verdade", "Cria o evento com nome e telefone do cliente"],
  },
  {
    id: "outlook",
    nome: "Outlook Calendar",
    logo: "/integracoes/outlook.svg",
    categoria: "agenda",
    auth: "oauth",
    oauthEnv: "MICROSOFT",
    descricao: "Agenda da Microsoft 365 para consultar e marcar horários.",
    faz: ["Cria o evento do agendamento no calendário"],
  },
  {
    id: "whatsapp",
    nome: "WhatsApp Business",
    logo: "/integracoes/whatsapp.svg",
    categoria: "mensagens",
    auth: "token",
    descricao: "Confirmações para os clientes e avisos de pendências para a equipe, pela API oficial da Meta.",
    faz: ["Envia a confirmação do agendamento", "Avisa a equipe quando um caso vira pendência"],
    campos: [
      { nome: "token", rotulo: "Token de acesso permanente", tipo: SEGREDO },
      { nome: "phoneId", rotulo: "ID do número de telefone", placeholder: "1234567890" },
    ],
    comoObter: "Meta for Developers › seu app › WhatsApp › Configuração da API: copie o ID do número e gere um token permanente de usuário do sistema.",
  },
  {
    id: "twilio",
    nome: "Twilio",
    logo: "/integracoes/twilio.svg",
    categoria: "telefonia",
    auth: "token",
    descricao: "Use os seus números Twilio para a recepcionista atender.",
    faz: ["Atende as ligações dos seus números", "Transfere para a equipe quando precisa"],
    campos: [
      { nome: "accountSid", rotulo: "Account SID", placeholder: "AC…" },
      { nome: "authToken", rotulo: "Auth Token", tipo: SEGREDO },
    ],
    comoObter: "Console Twilio › página inicial da conta: Account SID e Auth Token.",
  },
  {
    id: "hubspot",
    nome: "HubSpot",
    logo: "/integracoes/hubspot.svg",
    categoria: "crm",
    auth: "token",
    descricao: "Cria ou atualiza o contato e registra o resumo de cada ligação.",
    faz: ["Contato pelo telefone, sem duplicar", "Nota com o resumo ou o relatório do repasse"],
    campos: [{ nome: "token", rotulo: "Token do app privado", tipo: SEGREDO, placeholder: "pat-…" }],
    comoObter: "HubSpot › Configurações › Integrações › Apps privados › Criar app com escopos crm.objects.contacts.read/write.",
  },
  {
    id: "pipedrive",
    nome: "Pipedrive",
    logo: "/integracoes/pipedrive.png",
    categoria: "crm",
    auth: "token",
    descricao: "Cria a pessoa e anota o resumo da ligação; repasses viram negócios.",
    faz: ["Pessoa pelo telefone, sem duplicar", "Nota na pessoa", "Negócio para cada caso passado à equipe"],
    campos: [{ nome: "token", rotulo: "Token da API", tipo: SEGREDO }],
    comoObter: "Pipedrive › Preferências pessoais › API: copie o seu token pessoal.",
  },
  {
    id: "rd_station",
    nome: "RD Station CRM",
    logo: "/integracoes/rd_station.png",
    categoria: "crm",
    auth: "token",
    descricao: "Envia cada caso passado à equipe como negociação com o contato.",
    faz: ["Negociação com contato e telefone", "Anotação com o relatório"],
    campos: [{ nome: "token", rotulo: "Token da instância", tipo: SEGREDO }],
    comoObter: "RD Station CRM › Perfil › Integrações › Token da instância.",
  },
  {
    id: "kommo",
    nome: "Kommo",
    logo: "/integracoes/kommo.png",
    categoria: "crm",
    auth: "token",
    descricao: "Cria o lead com o contato e anota o resumo da ligação.",
    faz: ["Lead com contato e telefone", "Nota com o resumo ou o relatório"],
    campos: [
      { nome: "subdominio", rotulo: "Subdomínio", placeholder: "suaempresa (de suaempresa.kommo.com)" },
      { nome: "token", rotulo: "Token de longa duração", tipo: SEGREDO },
    ],
    comoObter: "Kommo › Configurações › Integrações › Criar integração privada › Chaves e escopos › Token de longa duração.",
  },
  {
    id: "zendesk",
    nome: "Zendesk",
    logo: "/integracoes/zendesk.svg",
    categoria: "atendimento",
    auth: "token",
    descricao: "Cada caso que a recepcionista passa para a equipe vira um ticket.",
    faz: ["Ticket com o relatório e a urgência", "Nota interna com o trecho da ligação"],
    campos: [
      { nome: "subdominio", rotulo: "Subdomínio", placeholder: "suaempresa (de suaempresa.zendesk.com)" },
      { nome: "email", rotulo: "E-mail do agente", tipo: "email" },
      { nome: "token", rotulo: "Token da API", tipo: SEGREDO },
    ],
    comoObter: "Zendesk Admin Center › Apps e integrações › APIs › API do Zendesk › Adicionar token.",
  },
  {
    id: "salesforce",
    nome: "Salesforce",
    logo: "/integracoes/salesforce.svg",
    categoria: "crm",
    auth: "oauth",
    oauthEnv: "SALESFORCE",
    descricao: "Cria um lead com o resumo de cada ligação.",
    faz: ["Lead com nome, telefone e descrição"],
  },
  {
    id: "google_sheets",
    nome: "Google Sheets",
    logo: "/integracoes/google_sheets.svg",
    categoria: "planilhas",
    auth: "oauth",
    oauthEnv: "GOOGLE",
    descricao: "Uma linha por ligação numa planilha sua.",
    faz: ["Data, telefone, motivo, resultado e resumo"],
  },
  {
    id: "make",
    nome: "Make",
    logo: "/integracoes/make.svg",
    categoria: "automacao",
    auth: "webhook",
    descricao: "Dispara um cenário do Make a cada ligação e a cada caso passado à equipe.",
    faz: ["Envia os dados da ligação para o seu cenário"],
    campos: [{ nome: "url", rotulo: "URL do webhook", tipo: "url", placeholder: "https://hook.us1.make.com/…" }],
    comoObter: "Make › novo cenário › módulo Webhooks › Custom webhook › copiar endereço.",
  },
  {
    id: "n8n",
    nome: "n8n",
    logo: "/integracoes/n8n.svg",
    categoria: "automacao",
    auth: "webhook",
    descricao: "Dispara um fluxo no seu n8n a cada ligação e a cada caso passado à equipe.",
    faz: ["Envia os dados da ligação para o seu fluxo"],
    campos: [{ nome: "url", rotulo: "URL do webhook (produção)", tipo: "url", placeholder: "https://seu-n8n/webhook/…" }],
    comoObter: "n8n › nó Webhook › método POST › copie a Production URL e ative o fluxo.",
  },
];

export const CATEGORIAS: Record<Categoria, string> = {
  telefonia: "Telefonia",
  mensagens: "Mensagens",
  agenda: "Agenda",
  crm: "CRM",
  atendimento: "Atendimento",
  planilhas: "Planilhas",
  automacao: "Automação",
};

export function conector(id: string): Conector | undefined {
  return CONECTORES.find((c) => c.id === id);
}
