import { orgDaChave } from "@/server/auth/api-key";
import { FERRAMENTAS_MCP } from "@/server/mcp/ferramentas";

/**
 * Recepta MCP server (Streamable HTTP, stateless JSON responses).
 * Connect: URL https://<host>/api/mcp, header Authorization: Bearer rk_… (Configurações › Chaves de API).
 */
const VERSOES = ["2025-11-25", "2025-06-18", "2025-03-26"];
const INFO = { name: "recepta", title: "Recepta", version: "1.0.0" };
const INSTRUCOES =
  "Recepta: recepcionistas virtuais que atendem as ligações de uma empresa. Use listar_recepcionistas para achar ids. Ajustes vão para o rascunho (ajustar_recepcionista → aplicar_ajuste → testar_recepcionista) e só valem nas ligações depois de publicar_recepcionista, que deve ser confirmado com o usuário.";

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const resposta = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0" as const, id: id ?? null, result });
const erro = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } });

async function tratar(orgId: string, m: Rpc) {
  switch (m.method) {
    case "initialize": {
      const pedida = String(m.params?.protocolVersion ?? "");
      return resposta(m.id, {
        protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: INFO,
        instructions: INSTRUCOES,
      });
    }
    case "ping":
      return resposta(m.id, {});
    case "tools/list":
      return resposta(m.id, {
        tools: FERRAMENTAS_MCP.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, ...(annotations ? { annotations } : {}) })),
      });
    case "tools/call": {
      const nome = String(m.params?.name ?? "");
      const f = FERRAMENTAS_MCP.find((x) => x.name === nome);
      if (!f) return erro(m.id, -32602, `Ferramenta desconhecida: ${nome}`);
      try {
        const r = await f.run(orgId, (m.params?.arguments ?? {}) as Record<string, unknown>);
        return resposta(m.id, { content: [{ type: "text", text: JSON.stringify(r, null, 1) }], structuredContent: Array.isArray(r) ? { itens: r } : r });
      } catch (e) {
        // tool errors go back to the model as results, so it can correct itself
        return resposta(m.id, { content: [{ type: "text", text: e instanceof Error ? e.message : "Erro" }], isError: true });
      }
    }
    default:
      return erro(m.id, -32601, `Método não suportado: ${m.method}`);
  }
}

export async function POST(req: Request) {
  const orgId = await orgDaChave(req);
  if (!orgId)
    return Response.json(erro(null, -32001, "Chave de API inválida. Crie uma em Configurações › Chaves de API e envie como Authorization: Bearer rk_…"), {
      status: 401,
      headers: { "www-authenticate": 'Bearer realm="recepta"' },
    });
  let corpo: Rpc | Rpc[];
  try {
    corpo = await req.json();
  } catch {
    return Response.json(erro(null, -32700, "JSON inválido"), { status: 400 });
  }
  const lote = Array.isArray(corpo) ? corpo : [corpo];
  const saidas = [];
  for (const m of lote) {
    if (m.id === undefined || m.method.startsWith("notifications/")) continue; // notifications: no reply
    saidas.push(await tratar(orgId, m));
  }
  if (!saidas.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(corpo) ? saidas : saidas[0], { headers: { "cache-control": "no-store" } });
}

/** No server-initiated stream in stateless mode. */
export async function GET() {
  return new Response("Use POST (MCP Streamable HTTP).", { status: 405, headers: { allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
