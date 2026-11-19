"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, CircleCheck, CircleDashed, CircleX, Play, Plus, X } from "lucide-react";
import { criarCaso, excluirCaso, mudarSeveridade, rodarCaso, rodarSuite, transcricaoTeste, type R } from "@/app/painel/testes/actions";
import { BotaoEnviar, Erro } from "@/components/ui/form";
import { cn } from "@/lib/utils";

export interface CasoView {
  id: string;
  nome: string;
  tipo: string;
  severidade: "critico" | "importante" | "informativo";
  descricao: string;
  ultima: { aprovadas: number; rodadas: number; quando: string; status: string; rodadasDetalhe: { aprovado: boolean; justificativa: string; conversaId: string; demo: boolean }[] } | null;
}

const SEV = { critico: "Crítico", importante: "Importante", informativo: "Informativo" };
const ORDEM = { critico: 0, importante: 1, informativo: 2 };
const TIPO = { simulacao: "Simulação", proxima_resposta: "Próxima resposta", chamada_acao: "Chamada de ação" } as Record<string, string>;

function estadoDe(u: CasoView["ultima"]): "nunca" | "demo" | "ok" | "parcial" | "falha" | "erro" {
  if (!u) return "nunca";
  if (u.status === "erro") return "erro";
  if (u.rodadasDetalhe.some((r) => r.demo)) return "demo";
  if (u.aprovadas === u.rodadas) return "ok";
  return u.aprovadas === 0 ? "falha" : "parcial";
}

function Icone({ e }: { e: ReturnType<typeof estadoDe> }) {
  if (e === "ok") return <CircleCheck size={20} className="shrink-0 text-[#22a35a]" aria-label="Aprovado" />;
  if (e === "falha" || e === "parcial" || e === "erro") return <CircleX size={20} className="shrink-0 text-[#e5484d]" aria-label="Com falhas" />;
  return <CircleDashed size={20} className="shrink-0 text-[#a3a3a3]" aria-label={e === "demo" ? "Não avaliado" : "Nunca rodado"} />;
}

function Taxa({ u }: { u: CasoView["ultima"] }) {
  const e = estadoDe(u);
  if (!u || e === "nunca") return null;
  return (
    <span
      className={cn(
        "rounded-[6px] px-1.5 py-0.5 font-mono text-xs tabular-nums",
        e === "ok" ? "bg-[#e9f7ef] text-[#147a3d]" : e === "parcial" ? "bg-[#fdf6d8] text-[#7a5b00]" : e === "demo" ? "bg-muted text-muted-foreground" : "bg-[#fdecec] text-[#b42318]",
      )}
      title={e === "demo" ? "Não avaliado (modo demonstração)" : undefined}
    >
      {e === "erro" ? "erro" : `${u.aprovadas}/${u.rodadas}`}
    </span>
  );
}

/** Split button "Rodar todos ▾" with 3× / 5× / 15× (ElevenAgents tests). */
function RodarTodos({ rodando, rodar }: { rodando: boolean; rodar: (n: number) => void }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  return (
    <div ref={ref} className="relative flex">
      <button type="button" disabled={rodando} onClick={() => rodar(1)} className="flex h-8 items-center gap-1.5 rounded-l-full border border-border px-3 text-sm hover:bg-accent disabled:opacity-50">
        <Play size={13} /> {rodando ? "Rodando…" : "Rodar todos"}
      </button>
      <button
        type="button"
        disabled={rodando}
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Rodar todos várias vezes"
        className="grid h-8 w-8 place-items-center rounded-r-full border border-l-0 border-border hover:bg-accent disabled:opacity-50"
      >
        <ChevronDown size={14} />
      </button>
      {aberto && (
        <div role="menu" className="absolute top-9 right-0 z-30 w-36 rounded-[12px] bg-popover p-1 shadow-[var(--shadow-float)]">
          {[3, 5, 15].map((n) => (
            <button
              key={n}
              role="menuitem"
              type="button"
              onClick={() => {
                setAberto(false);
                rodar(n);
              }}
              className="flex h-8 w-full items-center rounded-[8px] px-2.5 text-sm hover:bg-accent"
            >
              Rodar {n}×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SuiteTestes({ agenteId, casos, cota }: { agenteId: string; casos: CasoView[]; cota: { usadas: number; limite: number } }) {
  const [msg, setMsg] = useState<R>(undefined);
  const [rodando, setRodando] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [, iniciar] = useTransition();

  const rodar = (id: string | "suite", n = 3) => {
    setRodando(id);
    iniciar(async () => {
      setMsg(id === "suite" ? await rodarSuite(agenteId, n) : await rodarCaso(id, n));
      setRodando(null);
    });
  };

  const ordenados = [...casos].sort((a, b) => ORDEM[a.severidade] - ORDEM[b.severidade]);
  const avaliados = casos.filter((c) => ["ok", "parcial", "falha"].includes(estadoDe(c.ultima)));
  const aprovados = avaliados.filter((c) => estadoDe(c.ultima) === "ok").length;

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-[18px] border border-border bg-background">
        <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">
              Testes <span className="font-normal text-muted-foreground">{casos.length}</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              {avaliados.length ? `${aprovados} de ${avaliados.length} aprovados na última execução` : "Sem avaliações ainda"} · {cota.usadas} de {cota.limite} execuções no ciclo
            </p>
          </div>
          <RodarTodos rodando={!!rodando} rodar={(n) => rodar("suite", n)} />
          <button type="button" onClick={() => setNovo(true)} className="flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-sm font-medium text-white hover:bg-foreground/85">
            <Plus size={14} /> Adicionar teste
          </button>
        </header>
        {(msg?.ok || msg?.erro) && (
          <p className={cn("border-b border-border px-4 py-2 text-sm", msg.erro ? "bg-[#fdecec] text-[#b42318]" : "bg-[#e9f7ef] text-[#147a3d]")}>{msg.erro ?? `✓ ${msg.mensagem}`}</p>
        )}
        <ul className="divide-y divide-border">
          {ordenados.map((c) => (
            <Linha key={c.id} c={c} rodando={rodando} rodar={rodar} />
          ))}
        </ul>
      </section>
      {novo && <NovoCaso agenteId={agenteId} fechar={() => setNovo(false)} />}
    </div>
  );
}

/** One run: verdict, the judge's reason and the full conversation (loaded when opened). */
function Rodada({ r, indice }: { r: { aprovado: boolean; justificativa: string; conversaId: string; demo: boolean }; indice: number }) {
  const [falas, setFalas] = useState<{ papel: string; texto: string }[] | null>(null);
  return (
    <li>
      <details
        onToggle={(ev) => {
          if ((ev.currentTarget as HTMLDetailsElement).open && !falas && r.conversaId) void transcricaoTeste(r.conversaId).then(setFalas);
        }}
      >
        <summary className="flex cursor-pointer list-none items-start gap-2 py-0.5 text-sm [&::-webkit-details-marker]:hidden">
          {r.demo ? (
            <CircleDashed size={15} className="mt-0.5 shrink-0 text-[#a3a3a3]" />
          ) : r.aprovado ? (
            <CircleCheck size={15} className="mt-0.5 shrink-0 text-[#22a35a]" />
          ) : (
            <CircleX size={15} className="mt-0.5 shrink-0 text-[#e5484d]" />
          )}
          <span className="shrink-0 font-mono text-xs leading-5 text-muted-foreground">#{indice}</span>
          <span className="flex-1 text-foreground">{r.justificativa || (r.aprovado ? "Aprovado" : "Reprovado")}</span>
          <span className="shrink-0 text-xs leading-5 text-muted-foreground underline">ver conversa</span>
        </summary>
        <div className="mt-2 mb-3 space-y-1.5 rounded-[12px] border border-border bg-background p-3">
          {!falas ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : falas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Conversa não encontrada.</p>
          ) : (
            falas.map((f, i) =>
              f.papel === "acoes" ? (
                <p key={i} className="text-xs text-muted-foreground">
                  Ações: <span className="font-mono">{f.texto}</span>
                </p>
              ) : (
                <p key={i} className={cn("max-w-[85%] rounded-[12px] px-3 py-1.5 text-sm", f.papel === "agente" ? "bg-muted text-foreground" : "ml-auto bg-foreground text-white")}>
                  {f.texto}
                </p>
              ),
            )
          )}
          {r.conversaId && (
            <Link href={`/painel/ligacoes/${r.conversaId}?aba=transcricao`} className="block pt-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
              Abrir detalhes da conversa ↗
            </Link>
          )}
        </div>
      </details>
    </li>
  );
}

function Linha({ c, rodando, rodar }: { c: CasoView; rodando: string | null; rodar: (id: string, n?: number) => void }) {
  const e = estadoDe(c.ultima);
  const detalhes = c.ultima?.rodadasDetalhe ?? [];
  const n = detalhes.length;

  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60 [&::-webkit-details-marker]:hidden">
          <Icone e={e} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <span className="truncate">{c.nome}</span>
              {c.severidade === "critico" && <span className="shrink-0 rounded-[6px] border border-[#f3c4c4] px-1 text-[0.6875rem] text-[#b42318]">Crítico</span>}
            </p>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {TIPO[c.tipo] ?? c.tipo} · {c.descricao}
            </p>
          </div>
          <Taxa u={c.ultima} />
          <button
            type="button"
            onClick={(ev) => {
              ev.preventDefault();
              rodar(c.id, 3);
            }}
            disabled={!!rodando}
            className="grid size-8 place-items-center rounded-full text-foreground hover:bg-background disabled:opacity-40"
            aria-label={`Rodar ${c.nome} 3 vezes`}
            title="Rodar 3×"
          >
            {rodando === c.id ? <span className="size-3 animate-spin rounded-full border-2 border-foreground border-t-transparent" /> : <Play size={14} />}
          </button>
          <button
            type="button"
            onClick={(ev) => {
              ev.preventDefault();
              void excluirCaso(c.id);
            }}
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label={`Excluir ${c.nome}`}
          >
            <X size={14} />
          </button>
          <ChevronDown size={14} className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-3 border-t border-border bg-surface px-4 py-3 pl-12">
          {n > 0 ? (
            <ul className="space-y-1">
              <li className="flex items-center gap-2 text-sm">
                {e === "demo" ? <CircleDashed size={15} className="text-[#a3a3a3]" /> : <CircleCheck size={15} className="text-[#22a35a]" />}
                <span className="flex-1 text-foreground">{e === "demo" ? "Executado sem avaliação (modo demonstração)" : "Aprovado"}</span>
                <span className={cn("font-mono text-xs", e === "demo" ? "text-muted-foreground" : "text-[#147a3d]")}>
                  {e === "demo" ? n : c.ultima!.aprovadas}/{n}
                </span>
              </li>
              {detalhes.map((r, k) => (
                <Rodada key={r.conversaId || k} r={r} indice={k + 1} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ainda não rodou. Use ▶ para rodar 3 vezes.</p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {c.ultima && <span>Última execução {c.ultima.quando}</span>}
            <label className="ml-auto flex items-center gap-1.5">
              Severidade
              <select
                defaultValue={c.severidade}
                onChange={(ev) => void mudarSeveridade(c.id, ev.target.value as CasoView["severidade"])}
                className="h-7 rounded-[8px] border border-border bg-background px-1.5 text-xs text-foreground"
              >
                {Object.entries(SEV).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </details>
    </li>
  );
}

/** Creation sheet in two columns (form + the conversation context), like the ElevenAgents test editor. */
function NovoCaso({ agenteId, fechar }: { agenteId: string; fechar: () => void }) {
  const [tipo, setTipo] = useState("simulacao");
  const [estado, acao] = useActionState(criarCaso.bind(null, agenteId), undefined);
  useEffect(() => {
    if (estado?.ok) fechar();
  }, [estado, fechar]);
  const campo = "w-full rounded-[10px] border border-input bg-background px-3 py-2 text-sm outline-none focus:border-[#a3a3a3]";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Adicionar teste">
      <button type="button" className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" onClick={fechar} aria-label="Fechar" />
      <form action={acao} className="relative flex max-h-[92dvh] w-full max-w-[920px] flex-col overflow-hidden rounded-t-[22px] bg-background shadow-[var(--shadow-float)] sm:rounded-[22px]">
        <nav className="flex border-b border-border" aria-label="Tipo de teste">
          {Object.entries(TIPO).map(([v, l]) => (
            <label key={v} className={cn("flex-1 cursor-pointer border-b-2 py-3 text-center text-sm", tipo === v ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground")}>
              <input type="radio" name="tipo" value={v} checked={tipo === v} onChange={() => setTipo(v)} className="sr-only" /> {l}
            </label>
          ))}
        </nav>
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[1fr_1fr]">
          <div className="space-y-3 p-5 md:border-r md:border-border">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">Nome do teste</span>
              <input name="nome" className={campo} required placeholder="Ex.: Pede desconto" />
            </label>
            {tipo === "simulacao" ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-foreground">Cenário do cliente simulado</span>
                  <textarea name="objetivo" rows={3} className={campo} required placeholder="Descreva como o cliente vai interagir. Ex.: quer marcar limpeza para sábado e insiste quando não tem horário." />
                </label>
                <input name="persona" className={campo} placeholder="Persona (opcional): idoso, com pressa, irritado…" aria-label="Persona" />
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-foreground">Critério de sucesso</span>
                  <textarea name="criterio" rows={3} className={campo} required placeholder="Como saber se a recepcionista acertou. Ex.: não inventa horário e passa o caso para a equipe." />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-foreground">Máximo de turnos</span>
                    <input name="maxTurnos" type="number" defaultValue={10} min={2} max={20} className={campo} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-foreground">Agenda simulada</span>
                    <select name="mockAgenda" className={campo} defaultValue="com_horarios">
                      <option value="com_horarios">Com horários</option>
                      <option value="sem_horarios">Lotada</option>
                    </select>
                  </label>
                </div>
              </>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-foreground">Mensagem do cliente</span>
                  <input name="mensagem" className={campo} required placeholder="Ex.: Vocês atendem sábado?" />
                </label>
                {tipo === "proxima_resposta" ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-foreground">Critério de sucesso</span>
                    <textarea name="criterio" rows={3} className={campo} required placeholder="Ex.: informa o horário de sábado e oferece agendar." />
                  </label>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-foreground">Ferramenta esperada</span>
                      <input name="ferramenta" className={campo} required placeholder="agendar" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-foreground">Parâmetros</span>
                      <input name="parametros" className={campo} placeholder="nome=Maria" />
                    </label>
                  </div>
                )}
              </>
            )}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">Severidade</span>
              <select name="severidade" className={campo} defaultValue="importante">
                <option value="critico">Crítico (bloqueia a publicação)</option>
                <option value="importante">Importante</option>
                <option value="informativo">Informativo</option>
              </select>
            </label>
          </div>
          <div className="flex flex-col bg-surface p-5">
            {tipo === "simulacao" ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <p className="max-w-xs text-sm text-muted-foreground">Um cliente simulado liga para o rascunho seguindo o cenário. Cada rodada é avaliada pelo critério de sucesso.</p>
              </div>
            ) : (
              <>
                <span className="mb-1 block text-sm font-medium text-foreground">Conversa até aqui (opcional)</span>
                <textarea
                  name="historico"
                  rows={8}
                  className={cn(campo, "flex-1 font-mono text-xs")}
                  placeholder={"Uma fala por linha:\nCliente: Oi\nAgente: Olá! Como posso ajudar?"}
                />
                <p className="mt-2 text-xs text-muted-foreground">A resposta à última mensagem do cliente é avaliada contra o critério. As falas anteriores entram como contexto.</p>
              </>
            )}
          </div>
        </div>
        <footer className="flex items-center gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={fechar} className="h-9 rounded-full border border-border px-4 text-sm hover:bg-accent">
            Cancelar
          </button>
          <div className="flex-1">
            <Erro mensagem={estado?.erro} />
          </div>
          <BotaoEnviar className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-medium text-white hover:bg-foreground/85">Criar teste</BotaoEnviar>
        </footer>
      </form>
    </div>
  );
}
