/**
 * Abstract brand marks for connectors: each one is a composition in the palette of the
 * integration's logo, never the logo itself (no trademark artwork is reproduced).
 */
export type Padrao = "quadrantes" | "orbita" | "faixas" | "pontos" | "onda";

export interface Marca {
  nome: string;
  cores: string[];
  padrao: Padrao;
  fundo: string;
}

export const MARCAS = {
  google_agenda: { nome: "Google Agenda", cores: ["#4285F4", "#34A853", "#FBBC04", "#EA4335"], padrao: "quadrantes", fundo: "#ffffff" },
  whatsapp: { nome: "WhatsApp", cores: ["#25D366", "#128C7E", "#DCF8C6"], padrao: "orbita", fundo: "#effbf3" },
  email: { nome: "E-mail", cores: ["#5B6B7F", "#A9B6C6", "#E3E8EE"], padrao: "faixas", fundo: "#f5f7f9" },
  webhooks: { nome: "Webhooks", cores: ["#171717", "#737373", "#d4d4d4"], padrao: "pontos", fundo: "#f5f5f5" },
  outlook: { nome: "Outlook", cores: ["#0078D4", "#28A8EA", "#50D9FF", "#0358A7"], padrao: "quadrantes", fundo: "#f0f7fd" },
  hubspot: { nome: "HubSpot", cores: ["#FF7A59", "#FF5C35", "#FFD1C2"], padrao: "orbita", fundo: "#fff4f0" },
  rd_station: { nome: "RD Station", cores: ["#19325C", "#FF6B00", "#C9D3E3"], padrao: "faixas", fundo: "#f2f5fa" },
  pipedrive: { nome: "Pipedrive", cores: ["#017737", "#26B67C", "#BDEBD3"], padrao: "onda", fundo: "#eefaf3" },
  twilio: { nome: "Twilio", cores: ["#F22F46", "#FF8A99", "#FFE0E4"], padrao: "pontos", fundo: "#fff2f4" },
  asaas: { nome: "Asaas", cores: ["#0030B9", "#00C2FF", "#D6E4FF"], padrao: "onda", fundo: "#f0f4ff" },
} satisfies Record<string, Marca>;

export type MarcaId = keyof typeof MARCAS;
