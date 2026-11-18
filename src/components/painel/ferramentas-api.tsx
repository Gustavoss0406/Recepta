"use client";

import { useState, useTransition } from "react";
import { Database, Pencil, Plus, Trash2, Webhook } from "lucide-react";
import { acaoRemoverFerramentaApi, acaoSalvarFerramentaApi, acaoTestarFerramentaApi, type Resultado, type ResultadoApiDono } from "@/app/painel/actions";
import { BOTAO } from "@/components/painel/page-header";
import type { FerramentaApi } from "@/lib/agent/api-ferramenta";
import { cn } from "@/lib/utils";

const novoId = () => Math.random().toString(36).slice(2, 12).padEnd(8, "0");

const MODELOS: { rotulo: string; icone: typeof Database; f: () => FerramentaApi; cabecalho: string }[] = [
  {
    rotulo: "Consulta no Supabase",
    icone: Database,
    cabecalho: "apikey",
    f: () => ({
      id: novoId(),
      nome: "consultar_imoveis",
      descricao: "Busca imóveis disponíveis por bairro. Use quando o cliente perguntar o que há disponível numa região.",
      nivel: "consultar",
      metodo: "GET",
      url: "https://SEU-PROJETO.supabase.co/rest/v1/imoveis?select=*&bairro=ilike.*{bairro}*&limit=5",
      parametros: [{ nome: "bairro", descricao: "Bairro que o cliente quer", obrigatorio: true }],
      campos: [],
      cabecalhos: {},
      temCredencial: false,
    }),
  },
  {
    rotulo: "API própria",
    icone: Webhook,
    cabecalho: "Authorization",
    f: () => ({
      id: novoId(),
      nome: "consultar_pedido",
      descricao: "Consulta o status de um pedido pelo número. Use quando o cliente perguntar sobre um pedido.",
      nivel: "consultar",
      metodo: "GET",
      url: "https://api.suaempresa.com.br/pedidos/{numero}",
      parametros: [{ nome: "numero", descricao: "Número do pedido", obrigatorio: true }],
      campos: [],
      cabecalhos: {},
      temCredencial: false,
    }),
  },
];

/** The business's own systems as tools: the receptionist looks things up (and, if allowed, records them) during the call. */
export function FerramentasApi({ agenteId, ferramentas }: { agenteId: string; ferramentas: FerramentaApi[] }) {
  const [editando, setEditando] = useState<{ f: FerramentaApi; cabecalho: string } | null>(null);
  const [, iniciar] = useTransition();

  return (
    <section className="rounded-[18px] border border-border p-4">
      <div className="flex items-center gap-2">
        <Database size={16} className="text-muted-foreground" />
        <h2 className="text-[0.9375rem] font-medium text-foreground">Consultar os seus sistemas</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Durante a ligação, a recepcionista consulta o seu banco ou a sua API (pedidos, imóveis, estoque, cadastro) e responde na hora. Ela só vê os campos que você liberar.
      </p>

      {ferramentas.length > 0 && (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-[14px] border border-border">
          {ferramentas.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem]", f.nivel === "consultar" ? "bg-[#eef4ff] text-[#1d4ed8]" : "bg-[#fdf6d8] text-[#7a5b00]")}>
                {f.nivel === "consultar" ? "Consulta" : "Registra"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-sm text-foreground">{f.nome}</span>
                <span className="block truncate text-xs text-muted-foreground">{f.descricao}</span>
              </span>
              <button type="button" onClick={() => setEditando({ f, cabecalho: "Authorization" })} className="grid size-8 place-items-center rounded-full hover:bg-accent" aria-label={`Editar ${f.nome}`}>
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => confirm(`Remover ${f.nome}?`) && iniciar(async () => void (await acaoRemoverFerramentaApi(agenteId, f.id)))}
                className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive"
                aria-label={`Remover ${f.nome}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!editando && (
        <div className="mt-3 flex flex-wrap gap-2">
          {MODELOS.map((m) => (
            <button key={m.rotulo} type="button" onClick={() => setEditando({ f: m.f(), cabecalho: m.cabecalho })} className={cn(BOTAO.secundario, "h-8 px-3")}>
              <Plus size={14} /> {m.rotulo}
            </button>
          ))}
        </div>
      )}
      {editando && <Editor agenteId={agenteId} inicial={editando.f} cabecalhoInicial={editando.cabecalho} fechar={() => setEditando(null)} />}
    </section>
  );
}

function Editor({ agenteId, inicial, cabecalhoInicial, fechar }: { agenteId: string; inicial: FerramentaApi; cabecalhoInicial: string; fechar: () => void }) {
  const [f, setF] = useState(inicial);
  const [cabecalho, setCabecalho] = useState(cabecalhoInicial);
  const [segredo, setSegredo] = useState("");
  const [exemplo, setExemplo] = useState<Record<string, string>>({});
  const [r, setR] = useState<Resultado>(undefined);
  const [teste, setTeste] = useState<ResultadoApiDono | undefined>(undefined);
  const [ocupado, iniciar] = useTransition();
  const mudar = (p: Partial<FerramentaApi>) => setF((v) => ({ ...v, ...p }));
  const salvar = (depois?: () => Promise<void>) =>
    iniciar(async () => {
      const res = await acaoSalvarFerramentaApi(agenteId, f, segredo ? { cabecalho, valor: segredo } : undefined);
      setR(res);
      if (res?.ok) {
        if (segredo) mudar({ temCredencial: true });
        setSegredo("");
        await depois?.();
      }
    });

  return (
    <div className="mt-3 space-y-3 rounded-[14px] border border-foreground/20 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Nome (a recepcionista vê)</span>
          <input value={f.nome} onChange={(e) => mudar({ nome: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} className="field h-9 font-mono" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">O que ela pode fazer</span>
          <select value={f.nivel} onChange={(e) => mudar({ nivel: e.target.value as FerramentaApi["nivel"] })} className="field h-9">
            <option value="consultar">Só consultar</option>
            <option value="registrar">Registrar (com confirmação do cliente)</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">Quando usar (escreva como para uma pessoa)</span>
        <textarea value={f.descricao} onChange={(e) => mudar({ descricao: e.target.value })} rows={2} className="field min-h-0 resize-y py-2" />
      </label>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <select value={f.metodo} onChange={(e) => mudar({ metodo: e.target.value as FerramentaApi["metodo"] })} className="field h-9 w-auto" aria-label="Método">
          <option>GET</option>
          <option>POST</option>
          <option>PATCH</option>
        </select>
        <input value={f.url} onChange={(e) => mudar({ url: e.target.value })} className="field h-9 font-mono text-xs" aria-label="Endereço" spellCheck={false} />
      </div>
      <p className="text-xs text-muted-foreground">
        Use <code className="font-mono">{"{parametro}"}</code> no endereço para encaixar o que o cliente disser. Os outros parâmetros vão na consulta (GET) ou no corpo (POST/PATCH).
      </p>

      <div>
        <p className="mb-1 text-xs text-muted-foreground">Dados que ela pergunta ao cliente</p>
        {f.parametros.map((p, i) => (
          <div key={i} className="mb-1.5 flex gap-2">
            <input
              value={p.nome}
              onChange={(e) => mudar({ parametros: f.parametros.map((x, j) => (j === i ? { ...x, nome: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") } : x)) })}
              className="field h-9 w-36 font-mono text-xs"
              aria-label="Nome do parâmetro"
            />
            <input value={p.descricao} onChange={(e) => mudar({ parametros: f.parametros.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)) })} className="field h-9 flex-1" aria-label="Descrição" />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={p.obrigatorio} onChange={(e) => mudar({ parametros: f.parametros.map((x, j) => (j === i ? { ...x, obrigatorio: e.target.checked } : x)) })} /> obrig.
            </label>
            <button type="button" onClick={() => mudar({ parametros: f.parametros.filter((_, j) => j !== i) })} className="px-1 text-muted-foreground hover:text-destructive" aria-label="Remover parâmetro">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {f.parametros.length < 10 && (
          <button type="button" onClick={() => mudar({ parametros: [...f.parametros, { nome: "dado", descricao: "O que é este dado", obrigatorio: false }] })} className="text-xs text-muted-foreground underline">
            + parâmetro
          </button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <input value={cabecalho} onChange={(e) => setCabecalho(e.target.value)} className="field h-9 font-mono text-xs" aria-label="Cabeçalho da credencial" />
        <input
          type="password"
          value={segredo}
          onChange={(e) => setSegredo(e.target.value)}
          placeholder={f.temCredencial ? "Credencial salva (deixe vazio para manter)" : "Chave de acesso (fica criptografada)"}
          className="field h-9"
          autoComplete="off"
          aria-label="Chave de acesso"
        />
      </div>

      <div className="rounded-[12px] bg-muted/50 p-3">
        <p className="text-xs font-medium text-foreground">Testar com dados de exemplo</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {f.parametros.map((p) => (
            <input key={p.nome} placeholder={p.nome} value={exemplo[p.nome] ?? ""} onChange={(e) => setExemplo((v) => ({ ...v, [p.nome]: e.target.value }))} className="field h-8 w-40 text-xs" />
          ))}
          <button
            type="button"
            disabled={ocupado}
            onClick={() => salvar(async () => setTeste(await acaoTestarFerramentaApi(agenteId, f.id, exemplo)))}
            className={cn(BOTAO.secundario, "h-8 px-3")}
          >
            {ocupado ? "Testando…" : "Salvar e testar"}
          </button>
        </div>
        {teste?.erro && <p className="mt-2 text-sm text-[#b42318]">{teste.erro}</p>}
        {teste?.camposDisponiveis && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground">{teste.mensagem}. Marque o que a recepcionista pode ver e falar:</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {teste.camposDisponiveis.map((c) => {
                const on = f.campos.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => mudar({ campos: on ? f.campos.filter((x) => x !== c) : [...f.campos, c] })}
                    className={cn("rounded-full border px-2 py-0.5 font-mono text-[0.6875rem]", on ? "border-foreground bg-foreground text-white" : "border-border text-muted-foreground")}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            {f.campos.length > 0 && (
              <pre className="mt-2 max-h-40 overflow-auto rounded-[8px] bg-background p-2 text-[0.6875rem]">{JSON.stringify(teste.dados, null, 2)}</pre>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={ocupado} onClick={() => salvar(async () => fechar())} className={cn(BOTAO.primario, "h-8 px-3")}>
          Salvar
        </button>
        <button type="button" onClick={fechar} className={cn(BOTAO.fantasma, "h-8 px-3")}>
          Cancelar
        </button>
        {r?.erro && <span className="text-sm text-[#b42318]">{r.erro}</span>}
        {f.nivel === "registrar" && <span className="text-xs text-[#7a5b00]">Ela repete os dados e só envia depois que o cliente confirmar.</span>}
      </div>
    </div>
  );
}
