"use client";

import { useActionState, useState, useTransition } from "react";
import { Search, Trash2 } from "lucide-react";
import { acaoAdicionarTexto, acaoPerguntarConhecimento, acaoReindexarSite, acaoRemoverFonte } from "@/app/painel/actions";
import { BotaoEnviar, Erro } from "@/components/ui/form";
import { Grupo } from "./secoes";

interface Fonte {
  id: string;
  tipo: string;
  titulo: string;
  url: string | null;
  status: string;
  erro: string | null;
  paginas: number;
  atualizadoEm: Date;
}

export function Conhecimento({ agenteId, fontes }: { agenteId: string; fontes: Fonte[] }) {
  const [texto, enviarTexto] = useActionState(acaoAdicionarTexto.bind(null, agenteId), undefined);
  const [site, enviarSite] = useActionState(acaoReindexarSite.bind(null, agenteId), undefined);
  const [pergunta, setPergunta] = useState("");
  const [achados, setAchados] = useState<{ texto: string; origem: string | null }[] | null>(null);
  const [pend, iniciar] = useTransition();
  const urlSite = fontes.find((f) => f.tipo === "site")?.url ?? "";

  return (
    <div className="space-y-3">
      <Grupo titulo="Fontes" ajuda="A recepcionista responde só com base nestas fontes e nas informações da empresa.">
        {fontes.length ? (
          <ul className="divide-y divide-border rounded-[12px] border border-border bg-background">
            {fontes.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className={`size-2 shrink-0 rounded-full ${f.status === "pronto" ? "bg-success" : f.status === "erro" ? "bg-error" : "bg-muted-soft"}`} aria-label={f.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{f.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.tipo === "site" ? `Site · ${f.paginas} páginas` : f.tipo === "faq" ? "Perguntas e respostas" : "Texto"} · atualizado em{" "}
                    {new Date(f.atualizadoEm).toLocaleDateString("pt-BR")}
                    {f.erro && <span className="text-error"> · {f.erro}</span>}
                  </p>
                </div>
                <button type="button" onClick={() => void acaoRemoverFonte(agenteId, f.id)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-strong" aria-label={`Remover ${f.titulo}`}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma fonte ainda.</p>
        )}
      </Grupo>

      <Grupo titulo="Pergunte ao conhecimento" ajuda="Veja o trecho que a recepcionista usaria para responder.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => setAchados(await acaoPerguntarConhecimento(agenteId, pergunta)));
          }}
          className="flex gap-2"
        >
          <input value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Vocês aceitam Unimed?" className="field" aria-label="Pergunta" />
          <button type="submit" disabled={pend || !pergunta.trim()} className="btn btn-sm btn-primary !h-11">
            <Search size={14} /> Buscar
          </button>
        </form>
        {achados && (
          <ul className="space-y-2">
            {achados.length === 0 && <li className="text-sm text-muted-foreground">Nada encontrado. A recepcionista vai dizer que não sabe e oferecer recado.</li>}
            {achados.map((a, i) => (
              <li key={i} className="rounded-[12px] bg-white p-3 text-sm text-body shadow-[var(--shadow-pill)]">
                {a.texto.slice(0, 400)}
                {a.origem && <span className="mt-1 block truncate text-xs text-muted-foreground">{a.origem}</span>}
              </li>
            ))}
          </ul>
        )}
      </Grupo>

      <Grupo titulo="Atualizar do site">
        <form action={enviarSite} className="flex flex-wrap gap-2">
          <input name="url" defaultValue={urlSite} placeholder="www.suaempresa.com.br" className="field min-w-56 flex-1" required />
          <BotaoEnviar className="btn btn-sm btn-secondary !h-11">Ler o site de novo</BotaoEnviar>
        </form>
        {site?.ok && <p className="text-sm text-success">✓ {site.mensagem}</p>}
        <Erro mensagem={site?.erro} />
      </Grupo>

      <Grupo titulo="Adicionar texto" ajuda="Cardápio, tabela de preços, políticas, perguntas frequentes…">
        <form action={enviarTexto} className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
            <input name="titulo" placeholder="Título (ex.: Política de cancelamento)" className="field" />
            <select name="tipo" className="field">
              <option value="texto">Texto</option>
              <option value="faq">Perguntas e respostas</option>
            </select>
          </div>
          <textarea name="texto" rows={5} className="field !h-auto py-2.5" placeholder="Escreva aqui…" />
          <div className="flex items-center gap-3">
            <BotaoEnviar className="btn btn-sm btn-primary">Adicionar</BotaoEnviar>
            {texto?.ok && <span className="text-sm text-success">✓ {texto.mensagem}</span>}
          </div>
          <Erro mensagem={texto?.erro} />
        </form>
      </Grupo>
    </div>
  );
}
