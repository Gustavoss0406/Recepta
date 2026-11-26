import { FundoFotos } from "@/components/painel/capa";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exigirPermissao } from "@/server/auth/session";
import { googleConfigurado } from "@/server/integracoes/google";
import { BOTAO, PageHeader, Secao } from "@/components/painel/page-header";
import { NovoWebhook } from "@/components/painel/webhook-form";
import { MarcaIntegracao } from "@/components/ui/marca-integracao";
import { GoogleCard, IntegracaoCard } from "@/components/painel/integracao-card";
import { type PermissaoGoogle } from "@/lib/integracoes/google-permissoes";
import { CATEGORIAS, CONECTORES, type Categoria } from "@/lib/integracoes/catalogo";
import { oauthConfigurado } from "@/server/integracoes/oauth";
import type { Detalhes } from "@/server/integracoes/servico";
import type { MarcaId } from "@/lib/integracoes/marcas";
import { cn } from "@/lib/utils";
import { excluirWebhook, testarWebhook } from "./actions";

export const metadata = { title: "Integrações" };

export default async function IntegracoesPage({ searchParams }: { searchParams: Promise<{ erro?: string; conectado?: string; id?: string }> }) {
  const s = await exigirPermissao("integracoes");
  const sp = await searchParams;
  const db = getDb();
  const [conexoes, hooks, entregas, saida] = await Promise.all([
    db.select().from(schema.integracoes).where(eq(schema.integracoes.orgId, s.org.id)),
    db.select().from(schema.webhooks).where(eq(schema.webhooks.orgId, s.org.id)),
    db.select().from(schema.entregasWebhook).where(eq(schema.entregasWebhook.orgId, s.org.id)).orderBy(desc(schema.entregasWebhook.criadoEm)).limit(20),
    db.select().from(schema.caixaSaida).where(eq(schema.caixaSaida.orgId, s.org.id)).orderBy(desc(schema.caixaSaida.criadoEm)).limit(15),
  ]);
  const porTipo = new Map(conexoes.map((c) => [c.tipo, c]));
  // older connections were calendar-only ("google_agenda")
  if (!porTipo.has("google") && porTipo.has("google_agenda")) porTipo.set("google", { ...porTipo.get("google_agenda")!, detalhes: { ...(porTipo.get("google_agenda")!.detalhes as object), permissoes: ["agenda"] } });

  return (
    <>
      <PageHeader fundo={<FundoFotos slugs={["equipe", "recepcao", "advocacia"]} />} titulo="Integrações" descricao="Conecte a recepcionista às ferramentas da sua empresa." />
      {sp.erro && (
        <Secao className="pb-0">
          <p className="rounded-[12px] bg-[#fdecec] px-4 py-3 text-sm text-[#b42318]">
            {sp.erro === "google_nao_configurado" || sp.erro === "app_nao_configurado"
              ? "Esta integração ainda não tem o app da plataforma configurado (CLIENT_ID e CLIENT_SECRET)."
              : sp.erro === "google_cancelado"
                ? "Você cancelou a autorização no Google. Nada foi alterado."
                : "Não foi possível conectar. Tente de novo."}
          </p>
        </Secao>
      )}

      {(Object.keys(CATEGORIAS) as Categoria[]).map((cat) => {
        const lista = CONECTORES.filter((c) => c.categoria === cat);
        if (!lista.length) return null;
        return (
          <Secao key={cat} className="pb-1">
            <h2 className="mb-3 text-[0.8125rem] font-medium text-muted-foreground">{CATEGORIAS[cat]}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lista.map((c) => {
                const l = porTipo.get(c.id);
                const d = (l?.detalhes ?? {}) as Detalhes;
                const estado = { status: l?.status === "conectado" ? ("conectado" as const) : l?.status === "erro" ? ("erro" as const) : null, conta: d.conta, historico: d.historico };
                if (c.id === "google")
                  return <GoogleCard key={c.id} c={c} estado={estado} permissoes={(d.permissoes ?? []) as PermissaoGoogle[]} disponivel={googleConfigurado()} />;
                return (
                  <IntegracaoCard
                    key={c.id}
                    c={c}
                    estado={estado}
                    oauthDisponivel={oauthConfigurado(c.id)}
                    hrefOAuth={`/api/integracoes/${c.id}/oauth`}
                  />
                );
              })}
            </div>
          </Secao>
        );
      })}

      <Secao>
        <div className="mb-3 flex items-center gap-2.5">
          <MarcaIntegracao id="webhooks" tamanho={28} />
          <h2 className="text-[0.9375rem] font-medium text-foreground">Webhooks</h2>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <NovoWebhook />
            <p className="mt-3 text-xs text-muted-foreground">
              Cada envio tem o header <code className="font-mono">X-Recepta-Assinatura: sha256=HMAC(segredo, timestamp.corpo)</code>. Falhas são reenviadas até 6 vezes.
            </p>
            {hooks.length > 0 && (
              <ul className="mt-4 divide-y divide-border overflow-hidden rounded-[14px] border border-border">
                {hooks.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{h.url}</span>
                    <span className="text-xs text-muted-foreground">{h.eventos.join(", ")}</span>
                    <form action={testarWebhook.bind(null, h.id)}>
                      <button type="submit" className={cn(BOTAO.secundario, "h-7 px-2.5 text-xs")}>
                        Enviar teste
                      </button>
                    </form>
                    <form action={excluirWebhook.bind(null, h.id)}>
                      <button type="submit" className="text-xs text-destructive hover:underline">
                        Excluir
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-[0.8125rem] font-medium text-muted-foreground">Últimas entregas</p>
              <ul className="divide-y divide-border overflow-hidden rounded-[14px] border border-border text-xs">
                {entregas.length ? (
                  entregas.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-3 py-2">
                      <span className={cn("size-1.5 rounded-full", e.status === "entregue" ? "bg-[#22a35a]" : e.status === "falhou" ? "bg-[#e5484d]" : "bg-[#a3a3a3]")} aria-hidden />
                      <span className="font-mono">{e.evento}</span>
                      <span className="text-muted-foreground">
                        {e.status} · {e.tentativas}× {e.respostaStatus ? `· HTTP ${e.respostaStatus}` : ""}
                      </span>
                      <span className="ml-auto text-muted-foreground">{e.criadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", timeStyle: "short", dateStyle: "short" })}</span>
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-2.5 text-muted-foreground">Nenhuma entrega ainda.</li>
                )}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-[0.8125rem] font-medium text-muted-foreground">Caixa de saída (WhatsApp em modo simulado até conectar a API oficial)</p>
              <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-[14px] border border-border text-xs">
                {saida.length ? (
                  saida.map((m) => (
                    <li key={m.id} className="flex gap-2.5 px-3 py-2">
                      <MarcaIntegracao id={m.canal === "whatsapp" ? "whatsapp" : "email"} tamanho={18} className="mt-px" />
                      <span className="min-w-0">
                        <span className="text-muted-foreground">{m.destino || "—"} · </span>
                        <span className="text-foreground">{m.corpo.replace(/\n/g, " · ").slice(0, 160)}</span>
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-2.5 text-muted-foreground">Nenhuma mensagem ainda.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </Secao>
    </>
  );
}
