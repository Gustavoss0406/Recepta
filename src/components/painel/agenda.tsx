"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CloudOff, RefreshCw, X } from "lucide-react";
import { cancelar, salvarEvento, type R } from "@/app/painel/agenda/actions";
import { BOTAO } from "@/components/painel/page-header";
import { cn } from "@/lib/utils";

export interface EventoTela {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
  clienteNome: string | null;
  clienteTelefone: string | null;
  observacao: string | null;
  status: "confirmado" | "cancelado";
  origem: "recepcionista" | "manual" | "google";
  sincronia: "local" | "pendente" | "ok" | "erro";
}

const H = 48; // px per hour
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
/** Brasília wall clock (UTC-3, no DST). */
const local = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3_600_000);
const hhmm = (iso: string) => local(iso).toISOString().slice(11, 16);
const dataLocal = (iso: string) => local(iso).toISOString().slice(0, 10);

const COR = {
  recepcionista: "border-l-[#2563eb] bg-[#eef4ff]",
  manual: "border-l-[#0f766e] bg-[#ecfdf5]",
  google: "border-l-[#a3a3a3] bg-[#f5f5f5]",
};

type Form = { id?: string; data: string; inicio: string; duracao: number; titulo: string; clienteNome: string; clienteTelefone: string; observacao: string; origem?: EventoTela["origem"] };

export function AgendaSemana({ inicioSemana, eventos, horaInicio, horaFim }: { inicioSemana: string; eventos: EventoTela[]; horaInicio: number; horaFim: number }) {
  const [form, setForm] = useState<Form | null>(null);
  const dias = Array.from({ length: 7 }, (_, i) => new Date(new Date(inicioSemana).getTime() + i * 86_400_000).toISOString());
  const hoje = dataLocal(new Date().toISOString());
  const horas = Array.from({ length: horaFim - horaInicio }, (_, i) => horaInicio + i);
  const ativos = eventos.filter((e) => e.status === "confirmado");

  const novo = (diaIso: string, hora: number) =>
    setForm({ data: dataLocal(diaIso), inicio: `${String(hora).padStart(2, "0")}:00`, duracao: 30, titulo: "", clienteNome: "", clienteTelefone: "", observacao: "" });
  const abrir = (e: EventoTela) =>
    setForm({
      id: e.id,
      data: dataLocal(e.inicio),
      inicio: hhmm(e.inicio),
      duracao: Math.round((new Date(e.fim).getTime() - new Date(e.inicio).getTime()) / 60_000),
      titulo: e.titulo,
      clienteNome: e.clienteNome ?? "",
      clienteTelefone: e.clienteTelefone ?? "",
      observacao: e.observacao ?? "",
      origem: e.origem,
    });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#2563eb]" /> Marcado pela recepcionista</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#0f766e]" /> Marcado pela equipe</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#a3a3a3]" /> Do Google Agenda</span>
        <button type="button" onClick={() => novo(new Date().toISOString(), 9)} className={cn(BOTAO.primario, "ml-auto h-8 px-3")}>
          Novo compromisso
        </button>
      </div>

      {/* Week grid (tablet and up) */}
      <div className="hidden overflow-hidden rounded-[16px] border border-border md:block">
        <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-border bg-muted/40 text-xs">
          <span />
          {dias.map((d, i) => (
            <span key={d} className={cn("px-2 py-2 text-center", dataLocal(d) === hoje && "font-semibold text-foreground")}>
              {DIAS[i]} {local(d).getUTCDate()}
            </span>
          ))}
        </div>
        <div className="grid max-h-[640px] grid-cols-[52px_repeat(7,1fr)] overflow-y-auto">
          <div>
            {horas.map((h) => (
              <div key={h} style={{ height: H }} className="border-b border-border/60 pr-1 text-right text-[0.6875rem] text-muted-foreground">
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {dias.map((d) => (
            <div key={d} className={cn("relative border-l border-border/60", dataLocal(d) === hoje && "bg-[#fafcff]")}>
              {horas.map((h) => (
                <button key={h} type="button" aria-label={`Novo às ${h}h`} onClick={() => novo(d, h)} style={{ height: H }} className="block w-full border-b border-border/60 hover:bg-accent/60" />
              ))}
              {ativos
                .filter((e) => dataLocal(e.inicio) === dataLocal(d))
                .map((e) => {
                  const ini = local(e.inicio);
                  const minutos = ini.getUTCHours() * 60 + ini.getUTCMinutes() - horaInicio * 60;
                  const dur = (new Date(e.fim).getTime() - new Date(e.inicio).getTime()) / 60_000;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => abrir(e)}
                      style={{ top: Math.max(0, (minutos / 60) * H), height: Math.max(20, (dur / 60) * H - 2) }}
                      className={cn("absolute inset-x-1 overflow-hidden rounded-[6px] border-l-[3px] px-1.5 py-0.5 text-left text-[0.6875rem] leading-tight shadow-sm", COR[e.origem])}
                    >
                      <span className="flex items-center gap-1 font-medium text-foreground">
                        {hhmm(e.inicio)} {e.titulo}
                        <Sincronia s={e.sincronia} />
                      </span>
                      {e.clienteNome && <span className="block truncate text-muted-foreground">{e.clienteNome}</span>}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      {/* Day list (phones) */}
      <ul className="space-y-3 md:hidden">
        {dias.map((d, i) => {
          const doDia = ativos.filter((e) => dataLocal(e.inicio) === dataLocal(d));
          return (
            <li key={d} className="rounded-[14px] border border-border p-3">
              <p className={cn("text-sm", dataLocal(d) === hoje ? "font-semibold" : "text-muted-foreground")}>
                {DIAS[i]} {local(d).getUTCDate()}
              </p>
              {doDia.length ? (
                doDia.map((e) => (
                  <button key={e.id} type="button" onClick={() => abrir(e)} className={cn("mt-2 block w-full rounded-[8px] border-l-[3px] px-2 py-1.5 text-left text-sm", COR[e.origem])}>
                    {hhmm(e.inicio)} · {e.titulo} {e.clienteNome && <span className="text-muted-foreground">· {e.clienteNome}</span>}
                  </button>
                ))
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Livre</p>
              )}
            </li>
          );
        })}
      </ul>

      {form && <Folha inicial={form} fechar={() => setForm(null)} />}
    </>
  );
}

function Sincronia({ s }: { s: EventoTela["sincronia"] }) {
  if (s === "pendente") return <RefreshCw size={10} className="shrink-0 text-muted-foreground" aria-label="Sincronizando com o Google" />;
  if (s === "erro") return <CloudOff size={10} className="shrink-0 text-[#b42318]" aria-label="Não sincronizou com o Google" />;
  return null;
}

function Folha({ inicial, fechar }: { inicial: Form; fechar: () => void }) {
  const [estado, acao] = useActionState(salvarEvento, undefined as R);
  const [cancelando, iniciar] = useTransition();
  const [erroCancelar, setErroCancelar] = useState<string | null>(null);
  const [forcar, setForcar] = useState(false);
  // controlled fields: a failed save (e.g. conflict) must not wipe what was typed
  const [v, setV] = useState(inicial);
  const campo = (k: keyof Form) => ({
    name: k,
    value: String(v[k] ?? ""),
    onChange: (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value })),
  });
  useEffect(() => {
    if (estado?.ok) fechar();
  }, [estado, fechar]);
  const doGoogle = inicial.origem === "google";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={inicial.id ? "Editar compromisso" : "Novo compromisso"}>
      <button type="button" className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={fechar} aria-label="Fechar" />
      <form action={acao} className="relative w-full max-w-[440px] space-y-3 rounded-t-[22px] bg-background p-5 shadow-[var(--shadow-float)] sm:rounded-[22px]">
        <div className="flex items-center justify-between">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">{inicial.id ? "Compromisso" : "Novo compromisso"}</h2>
          <button type="button" onClick={fechar} className="grid size-8 place-items-center rounded-full hover:bg-accent" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        {doGoogle && <p className="rounded-[10px] bg-muted px-3 py-2 text-xs text-muted-foreground">Veio do Google Agenda. Mudanças aqui também vão para lá.</p>}
        <input type="hidden" name="id" value={inicial.id ?? ""} />
        <input type="hidden" name="forcar" value={forcar ? "1" : ""} />
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Título</span>
          <input {...campo("titulo")} required placeholder="Ex.: Avaliação" className="field h-9" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-3 block sm:col-span-1">
            <span className="mb-1 block text-xs text-muted-foreground">Data</span>
            <input type="date" {...campo("data")} required className="field h-9" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Início</span>
            <input type="time" {...campo("inicio")} required step={300} className="field h-9" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Duração (min)</span>
            <input type="number" {...campo("duracao")} min={5} max={720} step={5} className="field h-9" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Cliente</span>
            <input {...campo("clienteNome")} className="field h-9" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Telefone</span>
            <input {...campo("clienteTelefone")} className="field h-9" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Observação</span>
          <textarea {...campo("observacao")} rows={2} className="field min-h-0 resize-y py-2" />
        </label>
        {(estado?.erro || erroCancelar) && (
          <div className="rounded-[10px] bg-[#fdecec] px-3 py-2 text-sm text-[#b42318]">
            {estado?.erro ?? erroCancelar}
            {estado?.erro?.includes("Já existe") && (
              <label className="mt-1 flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={forcar} onChange={(e) => setForcar(e.target.checked)} /> Marcar mesmo assim (encaixe)
              </label>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="submit" className={cn(BOTAO.primario, "h-9 px-4")}>
            Salvar
          </button>
          {inicial.id && (
            <button
              type="button"
              disabled={cancelando}
              onClick={() =>
                confirm("Cancelar este compromisso?") &&
                iniciar(async () => {
                  const r = await cancelar(inicial.id!);
                  if (r?.ok) fechar();
                  else setErroCancelar(r?.erro ?? "Erro");
                })
              }
              className="h-9 rounded-full px-3 text-sm text-destructive hover:bg-[#fdecec]"
            >
              Cancelar compromisso
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
