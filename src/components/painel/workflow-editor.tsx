"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState, useTransition } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { CircleCheck, CircleUserRound, Flag, MessageSquareText, PhoneForwarded, PhoneOff, Plus, SlidersHorizontal, Split, Trash2, Wrench } from "lucide-react";
import { acaoSalvarWorkflow } from "@/app/painel/actions";
import { ROTULO_TIPO, validarWorkflow, type TipoNo, type Workflow } from "@/lib/agent/workflow";
import { cn } from "@/lib/utils";

type DadosNo = { tipo: TipoNo; titulo: string; texto: string };
type DadosAresta = { condicao: string; daAcao: boolean };
type NoRF = Node<DadosNo, "recepta">;
type ArestaRF = Edge<DadosAresta, "condicao">;

const ICONE: Record<TipoNo, typeof Flag> = {
  inicio: Flag,
  subagente: CircleUserRound,
  falar: MessageSquareText,
  acao: Wrench,
  atualizar_estado: SlidersHorizontal,
  condicao: Split,
  transferir: PhoneForwarded,
  fim: PhoneOff,
};

const FERRAMENTAS: [string, string][] = [
  ["repassar_para_equipe", "Passar o caso para a equipe"],
  ["consultar_horarios", "Consultar horários"],
  ["agendar", "Agendar"],
  ["enviar_whatsapp", "Enviar WhatsApp"],
  ["consultar_cadastro_cliente", "Consultar cadastro do cliente"],
];

/** Data every Condition can use (tool results add "<ferramenta>" and "<ferramenta>.<campo>"). */
const VARS_SISTEMA = ["dentro_do_horario", "cliente_identificado", "cliente_nome", "canal"];

/** Ready-made step: read the data back and only continue after the caller confirms. */
const CONFIRMAR = {
  titulo: "Confirmar dados",
  texto: "Repita para o cliente os dados que ele informou (nome, data, horário, valor) e pergunte se está tudo certo. Corrija o que ele pedir antes de seguir.",
};

function NoRecepta({ data, selected }: NodeProps<NoRF>) {
  const Icon = ICONE[data.tipo];
  const compacto = data.tipo === "inicio" || data.tipo === "fim";
  return (
    <div
      className={cn(
        "rounded-[12px] border bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow",
        selected ? "border-foreground shadow-[0_0_0_3px_rgba(0,0,0,0.06)]" : "border-[#e5e5e5]",
        compacto ? "px-3 py-2" : "w-[220px] px-3.5 py-3",
      )}
    >
      {data.tipo !== "inicio" && <Handle type="target" position={Position.Top} className="!size-2 !border-white !bg-[#a3a3a3]" />}
      <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-foreground">
        <Icon size={15} strokeWidth={1.7} className="shrink-0" />
        <span className="truncate">{data.titulo || ROTULO_TIPO[data.tipo]}</span>
      </p>
      {!compacto && data.texto && (
        <p className={cn("mt-1.5 line-clamp-2 text-xs text-muted-foreground", data.tipo === "acao" && "inline-block rounded-full border border-border px-2 py-0.5 font-mono text-[0.6875rem] text-foreground")}>
          {data.tipo === "acao" ? data.texto : data.texto}
        </p>
      )}
      {data.tipo !== "fim" && data.tipo !== "transferir" && <Handle type="source" position={Position.Bottom} className="!size-2 !border-white !bg-[#a3a3a3]" />}
    </div>
  );
}

function ArestaCondicao({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected }: EdgeProps<ArestaRF>) {
  const [caminho, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const c = (data?.condicao ?? "").trim();
  const tipo = c.toLowerCase() === "sucesso" ? "ok" : c.toLowerCase() === "falha" ? "falha" : c ? "cond" : "auto";
  return (
    <>
      <BaseEdge id={id} path={caminho} markerEnd={markerEnd} style={{ stroke: selected ? "#0a0a0a" : "#c4c4c4", strokeWidth: 1.25 }} />
      {tipo !== "auto" && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "nodrag nopan pointer-events-auto absolute line-clamp-2 max-w-[260px] rounded-[10px] px-2.5 py-1 text-center text-[0.6875rem] leading-snug font-medium",
              tipo === "ok" ? "bg-[#e9f7ef] text-[#147a3d]" : tipo === "falha" ? "bg-[#fdecec] text-[#b42318]" : "bg-[#0a0a0a] text-white",
              selected && "ring-2 ring-[#2563eb]/40",
            )}
            style={{ transform: `translate(-50%, -50%) translate(${(lx + targetX) / 2}px, ${(ly + targetY) / 2 - 6}px)` }}
          >
            {tipo === "ok" ? "Sucesso" : tipo === "falha" ? "Falha" : c}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { recepta: NoRecepta };
const edgeTypes = { condicao: ArestaCondicao };
const MARCA = { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#c4c4c4" };

function paraRF(wf: Workflow) {
  const tipoDe = new Map(wf.nos.map((n) => [n.id, n.tipo]));
  const nos: NoRF[] = wf.nos.map((n) => ({ id: n.id, type: "recepta", position: { x: n.x, y: n.y }, data: { tipo: n.tipo, titulo: n.titulo, texto: n.texto }, deletable: n.tipo !== "inicio" }));
  const arestas: ArestaRF[] = wf.arestas.map((a) => ({
    id: a.id,
    source: a.de,
    target: a.para,
    type: "condicao",
    markerEnd: MARCA,
    data: { condicao: a.condicao, daAcao: tipoDe.get(a.de) === "acao" },
  }));
  return { nos, arestas };
}

function deRF(ativo: boolean, nos: NoRF[], arestas: ArestaRF[]): Workflow {
  return {
    ativo,
    nos: nos.map((n) => ({ id: n.id, tipo: n.data.tipo, x: Math.round(n.position.x), y: Math.round(n.position.y), titulo: n.data.titulo, texto: n.data.texto })),
    arestas: arestas.map((e) => ({ id: e.id, de: e.source, para: e.target, condicao: e.data?.condicao ?? "" })),
  };
}

let seq = 0;
const novoId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

function Editor({
  agenteId,
  inicial,
  podeEditar,
  ferramentasExtras = [],
  modeloCompleto,
}: {
  agenteId: string;
  inicial: Workflow;
  podeEditar: boolean;
  ferramentasExtras?: [string, string][];
  modeloCompleto?: Workflow;
}) {
  const ferramentas = useMemo(() => [...FERRAMENTAS, ...ferramentasExtras], [ferramentasExtras]);
  const base = useMemo(() => paraRF(inicial), [inicial]);
  const [nos, setNos, onNodesChange] = useNodesState<NoRF>(base.nos);
  const [arestas, setArestas, onEdgesChange] = useEdgesState<ArestaRF>(base.arestas);
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [sel, setSel] = useState<{ tipo: "no" | "aresta"; id: string } | null>(null);
  const [msg, setMsg] = useState<{ ok?: boolean; texto: string; problemas?: string[] } | null>(null);
  const [salvando, iniciar] = useTransition();

  const problemas = validarWorkflow(deRF(true, nos, arestas));

  const onConnect = useCallback(
    (c: Connection) => {
      const daAcao = nos.find((n) => n.id === c.source)?.data.tipo === "acao";
      setArestas((es) => addEdge({ ...c, id: novoId("a"), type: "condicao", markerEnd: MARCA, data: { condicao: daAcao ? "sucesso" : "", daAcao } }, es));
    },
    [nos, setArestas],
  );

  function adicionar(tipo: TipoNo, preset?: { titulo: string; texto: string }) {
    const id = novoId("n");
    const y = Math.max(0, ...nos.map((n) => n.position.y)) + 140;
    setNos((ns) => [
      ...ns,
      {
        id,
        type: "recepta",
        position: { x: 160 + (ns.length % 3) * 40, y },
        data: preset ? { tipo, ...preset } : { tipo, titulo: ROTULO_TIPO[tipo], texto: tipo === "acao" ? "repassar_para_equipe" : "" },
      },
    ]);
    setSel({ tipo: "no", id });
  }

  const noSel = sel?.tipo === "no" ? nos.find((n) => n.id === sel.id) : undefined;
  const arestaSel = sel?.tipo === "aresta" ? arestas.find((e) => e.id === sel.id) : undefined;
  const mudarNo = (patch: Partial<DadosNo>) => setNos((ns) => ns.map((n) => (n.id === noSel?.id ? { ...n, data: { ...n.data, ...patch } } : n)));
  const mudarAresta = (condicao: string) => setArestas((es) => es.map((e) => (e.id === arestaSel?.id ? { ...e, data: { ...e.data!, condicao } } : e)));

  function salvar() {
    iniciar(async () => {
      const r = await acaoSalvarWorkflow(agenteId, deRF(ativo, nos, arestas));
      setMsg(r?.ok ? { ok: true, texto: r.mensagem ?? "Salvo" } : { texto: r?.erro ?? "Erro", problemas: r?.problemas });
    });
  }

  const campo = "w-full rounded-[10px] border border-input bg-background px-3 py-2 text-sm outline-none focus:border-[#a3a3a3]";

  return (
    <div className="flex h-[calc(100dvh-170px)] min-h-[520px] flex-col overflow-hidden rounded-[18px] border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="peer sr-only" disabled={!podeEditar} />
          <span className="relative h-6 w-10 shrink-0 rounded-full bg-[#e5e5e5] transition-colors peer-checked:bg-foreground after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
          Usar fluxo nas ligações
        </label>
        <span className="mx-1 h-5 w-px bg-border" />
        <button type="button" disabled={!podeEditar} onClick={() => adicionar("subagente", CONFIRMAR)} className="flex h-7 items-center gap-1 rounded-[8px] border border-border px-2 text-[0.8125rem] hover:bg-accent disabled:opacity-40">
          <Plus size={12} />
          <CircleCheck size={13} strokeWidth={1.7} /> Confirmar dados
        </button>
        {(["subagente", "falar", "acao", "condicao", "atualizar_estado", "transferir", "fim"] as TipoNo[]).map((t) => {
          const Icon = ICONE[t];
          return (
            <button key={t} type="button" disabled={!podeEditar} onClick={() => adicionar(t)} className="flex h-7 items-center gap-1 rounded-[8px] border border-border px-2 text-[0.8125rem] hover:bg-accent disabled:opacity-40">
              <Plus size={12} />
              <Icon size={13} strokeWidth={1.7} /> {ROTULO_TIPO[t]}
            </button>
          );
        })}
        {modeloCompleto && podeEditar && (
          <button
            type="button"
            onClick={() => {
              if (!confirm("Trocar o fluxo atual pelo modelo de atendimento completo? Você ainda precisa salvar.")) return;
              const m = paraRF(modeloCompleto);
              setNos(m.nos);
              setArestas(m.arestas);
              setAtivo(true);
              setSel(null);
            }}
            className="flex h-7 items-center gap-1 rounded-[8px] bg-foreground px-2.5 text-[0.8125rem] text-white hover:bg-foreground/85"
          >
            Usar modelo completo
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className={cn("text-sm", msg.ok ? "text-[#147a3d]" : "text-[#b42318]")}>{msg.texto}</span>}
          <button type="button" onClick={salvar} disabled={salvando || !podeEditar} className="h-8 rounded-full bg-foreground px-4 text-sm font-medium text-white hover:bg-foreground/85 disabled:opacity-40">
            {salvando ? "Salvando…" : "Salvar fluxo"}
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 bg-[#fcfcfc]">
          <ReactFlow
            nodes={nos}
            edges={arestas}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={podeEditar ? onNodesChange : undefined}
            onEdgesChange={podeEditar ? onEdgesChange : undefined}
            onConnect={podeEditar ? onConnect : undefined}
            onNodeClick={(_, n) => setSel({ tipo: "no", id: n.id })}
            onEdgeClick={(_, e) => setSel({ tipo: "aresta", id: e.id })}
            onPaneClick={() => setSel(null)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={podeEditar ? ["Backspace", "Delete"] : null}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#d4d4d4" />
            <Controls showInteractive={false} className="!rounded-[10px] !border !border-border !shadow-none [&_button]:!border-border" />
          </ReactFlow>
        </div>
        {(noSel || arestaSel || (ativo && problemas.length > 0)) && (
          <aside className="w-[300px] shrink-0 space-y-4 overflow-y-auto border-l border-border bg-background p-4 max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-10 max-md:shadow-[var(--shadow-float)]">
            {noSel && (
              <>
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {(() => {
                    const I = ICONE[noSel.data.tipo];
                    return <I size={15} />;
                  })()}
                  {ROTULO_TIPO[noSel.data.tipo]}
                </p>
                {noSel.data.tipo !== "inicio" && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Nome</span>
                    <input value={noSel.data.titulo} onChange={(e) => mudarNo({ titulo: e.target.value.slice(0, 60) })} className={campo} />
                  </label>
                )}
                {noSel.data.tipo === "subagente" && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Objetivo desta etapa</span>
                    <textarea value={noSel.data.texto} onChange={(e) => mudarNo({ texto: e.target.value })} rows={6} className={campo} placeholder="Ex.: Entenda o que o cliente precisa e confirme nome e telefone." />
                  </label>
                )}
                {noSel.data.tipo === "falar" && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Frase exata</span>
                    <textarea value={noSel.data.texto} onChange={(e) => mudarNo({ texto: e.target.value })} rows={3} className={campo} placeholder="Ex.: Vou te passar as opções disponíveis." />
                  </label>
                )}
                {noSel.data.tipo === "acao" && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Ferramenta</span>
                    <select value={noSel.data.texto} onChange={(e) => mudarNo({ texto: e.target.value })} className={campo}>
                      {ferramentas.map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs text-muted-foreground">Ligue as saídas como Sucesso ou Falha.</span>
                  </label>
                )}
                {noSel.data.tipo === "condicao" && (
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p>Escolhe o caminho pelos dados, sem depender da conversa. Escreva a condição em cada saída; a primeira verdadeira vence, e uma saída vazia vale como &quot;senão&quot;.</p>
                    <p>
                      Exemplos: <code className="font-mono">dentro_do_horario = sim</code>, <code className="font-mono">consultar_pedido.status = enviado</code>,{" "}
                      <code className="font-mono">consultar_orcamento.valor &gt; 500</code>, <code className="font-mono">cliente_identificado</code>.
                    </p>
                    <p>
                      Dados disponíveis: <span className="break-all font-mono">{VARS_SISTEMA.join(", ")}</span> e o resultado de cada ferramenta (<code className="font-mono">nome_da_ferramenta</code> = sucesso/falha e{" "}
                      <code className="font-mono">nome_da_ferramenta.campo</code>).
                    </p>
                  </div>
                )}
                {noSel.data.tipo === "atualizar_estado" && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Variável</span>
                    <input value={noSel.data.texto} onChange={(e) => mudarNo({ texto: e.target.value })} className={cn(campo, "font-mono")} placeholder="prioridade=alta" />
                  </label>
                )}
                {noSel.data.tipo === "transferir" && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Número (em branco usa o da aba Ferramentas)</span>
                    <input value={noSel.data.texto} onChange={(e) => mudarNo({ texto: e.target.value })} className={campo} placeholder="+55 11 3333-4444" />
                  </label>
                )}
                {noSel.data.tipo !== "inicio" && podeEditar && (
                  <button
                    type="button"
                    onClick={() => {
                      setNos((ns) => ns.filter((n) => n.id !== noSel.id));
                      setArestas((es) => es.filter((e) => e.source !== noSel.id && e.target !== noSel.id));
                      setSel(null);
                    }}
                    className="flex items-center gap-1.5 text-sm text-destructive hover:underline"
                  >
                    <Trash2 size={13} /> Remover
                  </button>
                )}
              </>
            )}
            {arestaSel && (
              <>
                <p className="text-sm font-semibold text-foreground">Condição do caminho</p>
                {arestaSel.data?.daAcao ? (
                  <select value={arestaSel.data.condicao} onChange={(e) => mudarAresta(e.target.value)} className={campo}>
                    <option value="sucesso">Sucesso</option>
                    <option value="falha">Falha</option>
                  </select>
                ) : (
                  <textarea
                    value={arestaSel.data?.condicao ?? ""}
                    onChange={(e) => mudarAresta(e.target.value.slice(0, 200))}
                    rows={3}
                    className={campo}
                    placeholder={
                      nos.find((n) => n.id === arestaSel.source)?.data.tipo === "condicao"
                        ? "Ex.: consultar_pedido.status = enviado (vazio = senão)"
                        : "Em linguagem simples. Ex.: o cliente quer marcar um horário"
                    }
                  />
                )}
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => {
                      setArestas((es) => es.filter((e) => e.id !== arestaSel.id));
                      setSel(null);
                    }}
                    className="flex items-center gap-1.5 text-sm text-destructive hover:underline"
                  >
                    <Trash2 size={13} /> Remover caminho
                  </button>
                )}
              </>
            )}
            {ativo && (problemas.length > 0 || (msg?.problemas?.length ?? 0) > 0) && (
              <div className="rounded-[12px] bg-[#fdf6d8] p-3 text-xs text-[#7a5b00]">
                <p className="mb-1 font-medium">Antes de ativar</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {(problemas.length ? problemas : msg!.problemas!).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

export function WorkflowEditor(props: { agenteId: string; inicial: Workflow; podeEditar: boolean; ferramentasExtras?: [string, string][]; modeloCompleto?: Workflow }) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}
