import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db/client";
import { exigirPermissao } from "@/server/auth/session";
import { formatBRL } from "@/lib/format";
import { PageHeader, Secao } from "@/components/painel/page-header";
import { pagarSimulado } from "../../actions";

/** Payment simulator page (only reachable when no payment gateway key is configured). */
export default async function PagarPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirPermissao("verCobranca");
  const { id } = await params;
  const [f] = await getDb()
    .select()
    .from(schema.faturas)
    .where(and(eq(schema.faturas.orgId, s.org.id), eq(schema.faturas.id, id)));
  if (!f) notFound();
  return (
    <>
      <PageHeader titulo="Pagamento" descricao="Ambiente de testes: nenhum dinheiro é cobrado." />
      <Secao>
        <div className="panel max-w-md space-y-4 p-6">
          <p className="rounded-[10px] bg-[#fff6e5] px-3 py-2 text-xs text-[#8a5a00]">Simulador de pagamento. Em produção, este link abre a cobrança do Asaas (Pix, boleto ou cartão).</p>
          <ul className="space-y-1 text-sm">
            {f.itens.map((i, k) => (
              <li key={k} className="flex justify-between gap-4">
                <span className="text-body">
                  {i.descricao}
                  {i.quantidade > 1 && ` × ${i.quantidade}`}
                </span>
                <span className="font-mono">{formatBRL(i.totalCentavos / 100)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between border-t border-hairline pt-3 text-[0.9375rem]">
            <span>Total</span>
            <span className="font-mono">{formatBRL(f.totalCentavos / 100)}</span>
          </p>
          {f.pixCopiaCola && (
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Pix copia e cola</span>
              <input readOnly value={f.pixCopiaCola} className="field font-mono text-xs" />
            </label>
          )}
          {f.status === "paga" ? (
            <p className="text-sm text-success">✓ Fatura paga</p>
          ) : (
            <form action={pagarSimulado.bind(null, f.id)}>
              <button type="submit" className="btn btn-primary w-full">
                Simular pagamento via Pix
              </button>
            </form>
          )}
        </div>
      </Secao>
    </>
  );
}
