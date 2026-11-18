import "server-only";

export interface CobrancaCriada {
  id: string;
  linkPagamento: string;
  pixCopiaCola?: string;
}

export interface Pagamentos {
  readonly real: boolean;
  garantirCliente(org: { id: string; nome: string; cnpj: string | null; email: string }): Promise<string>;
  criarCobranca(c: { clienteId: string; valorCentavos: number; vencimento: Date; descricao: string; referencia: string }): Promise<CobrancaCriada>;
}

/** Asaas v3 (Pix, boleto and card on one charge via billingType UNDEFINED). */
class Asaas implements Pagamentos {
  readonly real = true;
  constructor(
    private chave: string,
    private base: string,
  ) {}

  private async req<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(`${this.base}${path}`, {
      method: body ? "POST" : "GET",
      headers: { access_token: this.chave, "content-type": "application/json", "user-agent": "Recepta" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Asaas ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    return (await r.json()) as T;
  }

  async garantirCliente(org: { id: string; nome: string; cnpj: string | null; email: string }) {
    const c = await this.req<{ id: string }>("/customers", {
      name: org.nome,
      cpfCnpj: org.cnpj?.replace(/\D/g, "") || undefined,
      email: org.email,
      externalReference: org.id,
    });
    return c.id;
  }

  async criarCobranca(c: { clienteId: string; valorCentavos: number; vencimento: Date; descricao: string; referencia: string }) {
    const p = await this.req<{ id: string; invoiceUrl: string }>("/payments", {
      customer: c.clienteId,
      billingType: "UNDEFINED",
      value: c.valorCentavos / 100,
      dueDate: c.vencimento.toISOString().slice(0, 10),
      description: c.descricao,
      externalReference: c.referencia,
    });
    let pix: string | undefined;
    try {
      pix = (await this.req<{ payload: string }>(`/payments/${p.id}/pixQrCode`, null)).payload;
    } catch {
      /* Pix may be unavailable for the account */
    }
    return { id: p.id, linkPagamento: p.invoiceUrl, pixCopiaCola: pix };
  }
}

/** No gateway key: charges are simulated and paid from an in-app simulator (clearly labelled). */
class PagamentosSimulados implements Pagamentos {
  readonly real = false;
  async garantirCliente(org: { id: string }) {
    return `sim_cus_${org.id.slice(0, 8)}`;
  }
  async criarCobranca(c: { referencia: string }) {
    return { id: `sim_pay_${c.referencia.slice(0, 8)}`, linkPagamento: `/painel/cobranca/pagar/${c.referencia}`, pixCopiaCola: "00020126SIMULADO-RECEPTA" };
  }
}

export function getPagamentos(): Pagamentos {
  const k = process.env.ASAAS_API_KEY;
  return k ? new Asaas(k, process.env.ASAAS_BASE_URL ?? "https://api-sandbox.asaas.com/v3") : new PagamentosSimulados();
}
