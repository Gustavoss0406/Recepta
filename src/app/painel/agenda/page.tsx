import { FundoFotos } from "@/components/painel/capa";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { exigirSessao } from "@/server/auth/session";
import { primeiroAgente } from "@/server/agent/agentes";
import { eventosDoPeriodo, importarGoogle } from "@/server/agenda/agenda";
import { agendaGoogleConectada } from "@/server/integracoes/google";
import { PageHeader, Secao } from "@/components/painel/page-header";
import { AgendaSemana, type EventoTela } from "@/components/painel/agenda";

export const metadata = { title: "Agenda" };

const DIA = 86_400_000;
/** Monday 00:00 (Brasília) of the week containing `d`. */
function segunda(d: Date) {
  const local = new Date(d.getTime() - 3 * 3_600_000);
  const dow = (local.getUTCDay() + 6) % 7;
  const ini = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow) + 3 * 3_600_000;
  return new Date(ini);
}
const iso = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const s = await exigirSessao();
  const sp = await searchParams;
  const base = sp.semana && /^\d{4}-\d{2}-\d{2}$/.test(sp.semana) ? new Date(`${sp.semana}T12:00:00-03:00`) : new Date();
  const de = segunda(base);
  const ate = new Date(de.getTime() + 7 * DIA);
  const google = await agendaGoogleConectada(s.org.id).catch(() => false);
  // pull Google changes now so the page is fresh (bounded: the worker also does it every 5 min)
  if (google) await Promise.race([importarGoogle(s.org.id).catch(() => null), new Promise((r) => setTimeout(r, 2500))]);
  const [eventos, agente] = await Promise.all([eventosDoPeriodo(s.org.id, de, ate), primeiroAgente(s.org.id)]);
  const horarios = agente?.rascunho.horarios.semana;
  const abre = Math.min(8, ...(horarios ?? []).filter((d) => d.aberto).map((d) => Number(d.inicio.slice(0, 2))));
  const fecha = Math.max(18, ...(horarios ?? []).filter((d) => d.aberto).map((d) => Math.ceil(Number(d.fim.slice(0, 2)) + Number(d.fim.slice(3)) / 60)));

  const tela: EventoTela[] = eventos.map((e) => ({
    id: e.id,
    titulo: e.titulo,
    inicio: e.inicio.toISOString(),
    fim: e.fim.toISOString(),
    clienteNome: e.clienteNome,
    clienteTelefone: e.clienteTelefone,
    observacao: e.observacao,
    status: e.status,
    origem: e.origem,
    sincronia: e.sincronia,
  }));

  return (
    <>
      <PageHeader fundo={<FundoFotos slugs={["clinica", "salao", "academia"]} />}
        titulo="Agenda"
        descricao={
          google
            ? "Sincronizada com o Google Agenda nos dois sentidos. A recepcionista marca, remarca e cancela aqui."
            : "Agenda da Recepta: a recepcionista marca, remarca e cancela aqui. Conecte o Google em Integrações para espelhar."
        }
      />
      <Secao>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link href={`/painel/agenda?semana=${iso(new Date(de.getTime() - 7 * DIA))}`} className="grid size-8 place-items-center rounded-full border border-border hover:bg-accent" aria-label="Semana anterior">
            <ChevronLeft size={15} />
          </Link>
          <Link href="/painel/agenda" className="h-8 rounded-full border border-border px-3 text-sm leading-8 hover:bg-accent">
            Hoje
          </Link>
          <Link href={`/painel/agenda?semana=${iso(new Date(de.getTime() + 7 * DIA))}`} className="grid size-8 place-items-center rounded-full border border-border hover:bg-accent" aria-label="Próxima semana">
            <ChevronRight size={15} />
          </Link>
          <span className="ml-1 text-sm text-foreground">
            {de.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" })} –{" "}
            {new Date(ate.getTime() - DIA).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" })}
          </span>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${google ? "bg-[#e9f7ef] text-[#147a3d]" : "bg-muted text-muted-foreground"}`}>
            {google ? "Google Agenda conectado" : "Só agenda da Recepta"}
          </span>
        </div>
        <AgendaSemana inicioSemana={de.toISOString()} eventos={tela} horaInicio={Math.max(0, abre - 1)} horaFim={Math.min(24, fecha + 1)} />
      </Secao>
    </>
  );
}
