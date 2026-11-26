"use client";

import { useActionState, useState } from "react";
import { ArrowRight, BadgeCheck, Pause, Play, Plus, Search, Trash2 } from "lucide-react";
import type { AgentConfig } from "@/lib/agent/config";
import { DIAS, OBJETIVOS, saudacaoTemAviso } from "@/lib/agent/config";
import { servicosParaTexto } from "@/lib/agent/form";
import { MOTORES, VOICES, type MotorVoz, type Voice } from "@/lib/voices";
import { cn } from "@/lib/utils";
import { Orb } from "@/components/ui/orb";
import { BotaoEnviar, Erro } from "@/components/ui/form";

type Acao = (s: { ok?: boolean; erro?: string; mensagem?: string } | undefined, fd: FormData) => Promise<{ ok?: boolean; erro?: string; mensagem?: string } | undefined>;

function Form({ acao, children, rotulo = "Salvar rascunho" }: { acao: Acao; children: React.ReactNode; rotulo?: string }) {
  const [estado, enviar] = useActionState(acao, undefined);
  return (
    <form action={enviar} className="space-y-3">
      {children}
      <div className="sticky bottom-[calc(52px+env(safe-area-inset-bottom))] z-10 -mx-1 flex items-center gap-3 rounded-[14px] bg-background/80 px-1 py-3 backdrop-blur-xl lg:bottom-0">
        <BotaoEnviar className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-medium text-white transition-colors hover:bg-foreground/85">{rotulo}</BotaoEnviar>
        {estado?.ok && <span className="text-sm text-success">✓ {estado.mensagem}</span>}
        <div className="flex-1">
          <Erro mensagem={estado?.erro} />
        </div>
      </div>
    </form>
  );
}

export function Grupo({ titulo, ajuda, children }: { titulo: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 rounded-[16px] border border-black/[0.05] bg-surface p-4 sm:p-5">
      <legend className="float-left w-full text-[0.9375rem] font-medium text-foreground">{titulo}</legend>
      {ajuda && <p className="clear-both pt-0.5 text-sm leading-relaxed text-muted-foreground">{ajuda}</p>}
      <div className="clear-both min-w-0 space-y-3 pt-4">{children}</div>
    </fieldset>
  );
}

function Area({ name, defaultValue, rows = 4, placeholder, label }: { name: string; defaultValue?: string; rows?: number; placeholder?: string; label?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs text-muted-foreground">{label}</span>}
      <textarea name={name} defaultValue={defaultValue} rows={rows} placeholder={placeholder} className="field !h-auto py-2.5 leading-relaxed" />
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const { label, ...rest } = props;
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs text-muted-foreground">{label}</span>}
      <input {...rest} className={`field ${rest.className ?? ""}`} />
    </label>
  );
}

function Toggle({ name, defaultChecked, label, descricao }: { name: string; defaultChecked: boolean; label: string; descricao?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[12px] border border-border bg-background px-3.5 py-3">
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {descricao && <span className="mt-0.5 block text-xs text-muted-foreground">{descricao}</span>}
      </span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="relative h-6 w-10 shrink-0 rounded-full bg-[#e5e5e5] transition-colors duration-200 peer-checked:bg-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(0,0,0,0.2)] after:transition-transform after:duration-200 after:ease-[var(--ease-apple)] peer-checked:after:translate-x-4" />
    </label>
  );
}

/* ───────── Empresa ───────── */
export function SecaoEmpresa({ config, acao, rotulo }: { config: AgentConfig; acao: Acao; rotulo?: string }) {
  const e = config.empresa;
  return (
    <Form acao={acao} rotulo={rotulo}>
      <Grupo titulo="Empresa" ajuda="A recepcionista usa estas informações para responder.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input name="nome" label="Nome" defaultValue={e.nome} required />
          <Input name="cidade" label="Cidade" defaultValue={e.cidade} />
        </div>
        <Input name="endereco" label="Endereço" defaultValue={e.endereco} />
        <Input name="telefone" label="Telefone" defaultValue={e.telefone} />
      </Grupo>
      <Grupo titulo="Serviços e preços" ajuda="Um por linha: nome | preço | duração. Ex.: Limpeza | R$ 180 | 40 min">
        <Area name="servicos" defaultValue={servicosParaTexto(e.servicos)} rows={6} />
      </Grupo>
      <Grupo titulo="Pagamento e convênios" ajuda="Um por linha.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Area name="formasPagamento" label="Formas de pagamento" defaultValue={e.formasPagamento.join("\n")} />
          <Area name="convenios" label="Convênios aceitos" defaultValue={e.convenios.join("\n")} />
        </div>
      </Grupo>
      <Grupo titulo="Observações" ajuda="Estacionamento, acessibilidade, políticas de atraso…">
        <Area name="observacoes" defaultValue={e.observacoes} rows={3} />
      </Grupo>
    </Form>
  );
}

/* ───────── Comportamento ───────── */
export function SecaoComportamento({ config, acao, rotulo }: { config: AgentConfig; acao: Acao; rotulo?: string }) {
  const c = config.comportamento;
  const [saud, setSaud] = useState(c.saudacao);
  const temAviso = saudacaoTemAviso(saud);
  return (
    <Form acao={acao} rotulo={rotulo}>
      <Grupo titulo="Saudação" ajuda="Por transparência, a saudação diz que é a recepcionista virtual e que a ligação é gravada. Se o cliente perguntar, ela confirma que é atendimento virtual; nunca diz ser uma pessoa.">
        <Input name="nomeAgente" label="Nome do agente" defaultValue={c.nomeAgente} required />
        <label className="block">
          <span className="mb-1.5 block text-xs text-muted-foreground">Primeira fala</span>
          <textarea name="saudacao" value={saud} onChange={(e) => setSaud(e.target.value)} rows={3} className="field !h-auto py-2.5" />
        </label>
        <p className={`text-xs ${temAviso ? "text-success" : "text-error"}`}>
          {temAviso ? "✓ Contém o aviso de atendimento virtual e de gravação" : "✗ Inclua que é a recepcionista virtual e que a ligação é gravada"}
        </p>
      </Grupo>
      <Grupo titulo="O que a recepcionista faz">
        <div className="grid gap-2">
          {Object.entries(OBJETIVOS).map(([k, v]) => (
            <label key={k} className="flex items-center gap-2.5 text-sm text-ink">
              <input type="checkbox" name="objetivos" value={k} defaultChecked={c.objetivos.includes(k as keyof typeof OBJETIVOS)} className="size-4 accent-black" />
              {v}
            </label>
          ))}
        </div>
      </Grupo>
      <Grupo titulo="Regras" ajuda="Uma por linha, em linguagem simples.">
        <Area name="fazer" label="Sempre" defaultValue={c.fazer.join("\n")} />
        <Area name="nuncaFazer" label="Nunca" defaultValue={c.nuncaFazer.join("\n")} />
        <Area name="quandoTransferir" label="Quando transferir para uma pessoa" defaultValue={c.quandoTransferir.join("\n")} />
      </Grupo>
      <Grupo titulo="Tom de voz">
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["formal", "Formal"],
              ["equilibrado", "Equilibrado"],
              ["descontraido", "Descontraído"],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className="flex h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-hairline-strong bg-white px-3 text-sm has-[:checked]:border-ink has-[:checked]:shadow-[0_0_0_1px_#000]">
              <input type="radio" name="tom" value={v} defaultChecked={c.tom === v} className="accent-black" />
              {l}
            </label>
          ))}
        </div>
      </Grupo>
      <Grupo titulo="Inteligência" ajuda="O modo avançado raciocina melhor em casos complexos e custa +R$ 0,20 por minuto.">
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["padrao", "Padrão", "Rápido e econômico"],
              ["avancado", "Avançado", "+R$ 0,20/min"],
            ] as const
          ).map(([v, l, d]) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-hairline-strong bg-white px-3 py-2.5 text-sm has-[:checked]:border-ink has-[:checked]:shadow-[0_0_0_1px_#000]">
              <input type="radio" name="modelo" value={v} defaultChecked={config.modelo === v} className="accent-black" />
              <span>
                {l} <span className="block text-xs text-muted-foreground">{d}</span>
              </span>
            </label>
          ))}
        </div>
      </Grupo>
      <Grupo titulo="Instruções adicionais" ajuda="Modo avançado: texto livre anexado ao prompt.">
        <Area name="instrucoesExtras" defaultValue={c.instrucoesExtras} rows={3} />
      </Grupo>
    </Form>
  );
}

/* ───────── Voz ───────── */
export function SecaoVoz({
  config,
  acao,
  rotulo,
  motoresAtivos = { premium: true, drama: false, voicestudio: false },
}: {
  config: AgentConfig;
  acao: Acao;
  rotulo?: string;
  motoresAtivos?: Record<MotorVoz, boolean>;
}) {
  const [voz, setVoz] = useState(config.voz.vozId);
  const [tocando, setTocando] = useState<string | null>(null);
  const [pron, setPron] = useState(config.voz.pronuncias.length ? config.voz.pronuncias : [{ termo: "", falar: "" }]);

  async function ouvir(id: string) {
    if (tocando) return;
    setTocando(id);
    try {
      const r = await fetch(`/api/vozes/${id}/previa`);
      if (!r.ok) throw new Error(await r.text());
      const a = new Audio(URL.createObjectURL(await r.blob()));
      a.onended = () => setTocando(null);
      await a.play();
    } catch (e) {
      setTocando(null);
      alert(`Prévia indisponível. ${e instanceof Error && e.message ? e.message : "Tente de novo."}`);
    }
  }

  return (
    <Form acao={acao} rotulo={rotulo}>
      <Grupo titulo="Vozes" ajuda="Catálogo Recepta. Ouça antes de escolher.">
        <input type="hidden" name="vozId" value={voz} />
        <VozesExplorar voz={voz} setVoz={setVoz} tocando={tocando} ouvir={ouvir} motoresAtivos={motoresAtivos} />
      </Grupo>
      <Grupo titulo="Velocidade">
        <Input type="range" name="velocidade" min={0.9} max={1.15} step={0.05} defaultValue={config.voz.velocidade} className="!h-auto accent-black" aria-label="Velocidade da fala" />
      </Grupo>
      <Grupo titulo="Voz Ultra" ajuda="Fidelidade máxima. Adicional de R$ 0,20 por minuto.">
        <Toggle name="ultra" defaultChecked={config.voz.ultra} label="Usar Voz Ultra" />
      </Grupo>
      <Grupo titulo="Pronúncia" ajuda="Como a recepcionista deve falar termos específicos.">
        {pron.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input name="termo" defaultValue={p.termo} placeholder="Dr." className="field" aria-label="Termo" />
            <input name="falar" defaultValue={p.falar} placeholder="doutor" className="field" aria-label="Como falar" />
            <button type="button" onClick={() => setPron(pron.filter((_, j) => j !== i))} className="grid size-11 shrink-0 place-items-center rounded-[10px] text-muted-foreground hover:bg-strong" aria-label="Remover">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setPron([...pron, { termo: "", falar: "" }])} className="btn btn-sm btn-secondary">
          <Plus size={14} /> Adicionar termo
        </button>
      </Grupo>
    </Form>
  );
}

/* ───────── Ações ───────── */
export function SecaoAcoes({ config, acao, googleConectado }: { config: AgentConfig; acao: Acao; googleConectado: boolean }) {
  const a = config.acoes;
  const [hooks, setHooks] = useState(a.webhooks);
  return (
    <Form acao={acao}>
      <Grupo titulo="Agendamento">
        <Toggle name="agendar" defaultChecked={a.agendar.ativo} label="Agendar, remarcar e cancelar" descricao="Consulta horários livres e confirma com o cliente." />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">Agenda</span>
            <select name="agenda" defaultValue={a.agendar.agenda} className="field">
              <option value="interna">Agenda Recepta</option>
              <option value="google" disabled={!googleConectado}>
                Google Agenda {googleConectado ? "" : "(conecte em Integrações)"}
              </option>
            </select>
          </label>
          <Input name="duracao" type="number" min={10} step={5} label="Duração padrão (min)" defaultValue={a.agendar.duracaoPadraoMin} />
        </div>
      </Grupo>
      <Grupo titulo="Transferência" ajuda="Para quem a recepcionista passa a ligação quando precisa de uma pessoa.">
        <Toggle name="transferir" defaultChecked={a.transferir.ativo} label="Transferir para uma pessoa" />
        <Input name="numeroTransferencia" label="Número (com DDD)" placeholder="+55 11 3333-4444" defaultValue={a.transferir.numero} />
        <Toggle name="somenteHorario" defaultChecked={a.transferir.somenteHorarioComercial} label="Só no horário de atendimento" descricao="Fora do horário, o caso vai para a equipe com um relatório." />
      </Grupo>
      <Grupo titulo="Repasse para a equipe" ajuda="Sempre ativo. Quando a recepcionista não tem certeza, ela avisa o cliente que alguém vai retornar e cria uma pendência com o relatório do caso.">
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink">Avisar o dono por</span>
          <select name="notificar" defaultValue={a.repassar?.notificar ?? "ambos"} className="field">
            <option value="ambos">WhatsApp e e-mail</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">E-mail</option>
          </select>
        </label>
      </Grupo>
      <Grupo titulo="Outras ações">
        <Toggle name="whatsapp" defaultChecked={a.whatsapp.ativo} label="Enviar confirmação por WhatsApp" />
      </Grupo>
      <Grupo titulo="Webhooks personalizados" ajuda="Avançado. A recepcionista chama sua URL (POST JSON). Parâmetros separados por vírgula; * = obrigatório.">
        {hooks.map((w, i) => (
          <div key={i} className="space-y-2 rounded-[12px] bg-white p-3 shadow-[var(--shadow-pill)]">
            <div className="grid gap-2 sm:grid-cols-2">
              <input name="wh_nome" defaultValue={w.nome} placeholder="consultar_pedido" className="field" aria-label="Nome da ferramenta" />
              <input name="wh_url" defaultValue={w.url} placeholder="https://sua-api.com/pedido" className="field" aria-label="URL" />
            </div>
            <input name="wh_descricao" defaultValue={w.descricao} placeholder="Consulta o status de um pedido pelo número" className="field" aria-label="Descrição" />
            <div className="flex gap-2">
              <input name="wh_parametros" defaultValue={w.parametros.map((p) => p.nome + (p.obrigatorio ? "*" : "")).join(", ")} placeholder="numero_pedido*, cpf" className="field" aria-label="Parâmetros" />
              <button type="button" onClick={() => setHooks(hooks.filter((_, j) => j !== i))} className="grid size-11 shrink-0 place-items-center rounded-[10px] text-muted-foreground hover:bg-strong" aria-label="Remover webhook">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setHooks([...hooks, { nome: "", descricao: "", url: "", parametros: [] }])} className="btn btn-sm btn-secondary">
          <Plus size={14} /> Adicionar webhook
        </button>
      </Grupo>
    </Form>
  );
}

/* ───────── Horários ───────── */
export function SecaoHorarios({ config, acao }: { config: AgentConfig; acao: Acao }) {
  const h = config.horarios;
  return (
    <Form acao={acao}>
      <Grupo titulo="Horário de atendimento" ajuda="Usado para agenda, transferências e o que fazer fora do horário. Horário de Brasília.">
        <div className="divide-y divide-hairline rounded-[12px] bg-white shadow-[var(--shadow-pill)]">
          {DIAS.map((d, i) => (
            <div key={d} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <label className="flex w-32 items-center gap-2 text-sm text-ink">
                <input type="checkbox" name={`aberto_${i}`} defaultChecked={h.semana[i].aberto} className="size-4 accent-black" /> {d}
              </label>
              <input type="time" name={`inicio_${i}`} defaultValue={h.semana[i].inicio} className="field !h-9 !w-28" aria-label={`Abre ${d}`} />
              <span className="text-xs text-muted-foreground">até</span>
              <input type="time" name={`fim_${i}`} defaultValue={h.semana[i].fim} className="field !h-9 !w-28" aria-label={`Fecha ${d}`} />
            </div>
          ))}
        </div>
      </Grupo>
      <Grupo titulo="Feriados" ajuda="Datas sem atendimento, uma por linha (AAAA-MM-DD).">
        <Area name="feriados" defaultValue={h.feriados.join("\n")} placeholder={"2026-12-25\n2027-01-01"} />
      </Grupo>
      <Grupo titulo="Fora do horário">
        <select name="foraDoHorario" defaultValue={h.foraDoHorario} className="field">
          <option value="atender">Resolver tudo o que puder (dúvidas, agenda, consultas) e passar o resto para a equipe</option>
          <option value="recado">Só anotar o recado e passar para a equipe</option>
        </select>
      </Grupo>
    </Form>
  );
}

/* ───────── Dados coletados ───────── */
export function SecaoDados({ config, acao }: { config: AgentConfig; acao: Acao }) {
  const [campos, setCampos] = useState(config.dados.campos);
  return (
    <Form acao={acao}>
      <Grupo titulo="Dados que a recepcionista coleta" ajuda="Aparecem no resumo de cada ligação e no webhook.">
        {campos.map((c, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <input type="hidden" name="chave" value={c.chave} />
            <input name="rotulo" defaultValue={c.rotulo} placeholder="Nome do paciente" className="field min-w-40 flex-1" aria-label="Campo" />
            <select name="tipo" defaultValue={c.tipo} className="field !w-32" aria-label="Tipo">
              <option value="texto">Texto</option>
              <option value="telefone">Telefone</option>
              <option value="cpf">CPF</option>
              <option value="email">E-mail</option>
              <option value="data">Data</option>
            </select>
            <select name="obrigatorio" defaultValue={c.obrigatorio ? "sim" : "nao"} className="field !w-36" aria-label="Obrigatório">
              <option value="sim">Obrigatório</option>
              <option value="nao">Opcional</option>
            </select>
            <button type="button" onClick={() => setCampos(campos.filter((_, j) => j !== i))} className="grid size-11 place-items-center rounded-[10px] text-muted-foreground hover:bg-strong" aria-label="Remover campo">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setCampos([...campos, { chave: "", rotulo: "", tipo: "texto", obrigatorio: false }])} className="btn btn-sm btn-secondary">
          <Plus size={14} /> Adicionar campo
        </button>
      </Grupo>
    </Form>
  );
}

/* ───────── Segurança ───────── */
export function SecaoSeguranca({ config, acao }: { config: AgentConfig; acao: Acao }) {
  const s = config.seguranca;
  return (
    <Form acao={acao}>
      <Grupo titulo="Temas proibidos" ajuda="Um por linha. Ela se recusa educadamente.">
        <Area name="temasProibidos" defaultValue={s.temasProibidos.join("\n")} />
      </Grupo>
      <Grupo titulo="Limites da ligação">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input name="duracaoMaxMin" type="number" min={2} max={60} label="Duração máxima (min)" defaultValue={s.duracaoMaxMin} />
          <Input name="silencioEncerrarS" type="number" min={5} max={120} label="Encerrar após silêncio (s)" defaultValue={s.silencioEncerrarS} />
        </div>
        <Toggle name="bloquearSpam" defaultChecked={s.bloquearSpam} label="Bloquear robocalls e spam" descricao="Encerra ligações automáticas sem fala humana." />
      </Grupo>
    </Form>
  );
}

/* ───────── Canais (widget) ───────── */
export function SecaoCanais({ config, acao, agenteId, origem }: { config: AgentConfig; acao: Acao; agenteId: string; origem: string }) {
  const w = config.widget;
  const snippet = `<script src="${origem}/widget.js" data-agente="${agenteId}" data-cor="${w.cor}" data-texto="${w.texto}" async></script>`;
  const [copiado, setCopiado] = useState(false);
  return (
    <Form acao={acao}>
      <Grupo titulo="Widget do site" ajuda="Um botão no canto do seu site: o visitante fala com a recepcionista pelo navegador, como numa ligação. Usa a versão publicada e conta minutos como uma ligação.">
        <Toggle name="ativo" defaultChecked={w.ativo ?? true} label="Widget ativo" descricao="Desligado, o botão some dos sites onde o código estiver instalado." />
      </Grupo>
      <Grupo titulo="Aparência" ajuda="O widget usa a fonte do sistema do visitante.">
        <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
          <Input name="cor" type="color" label="Cor do botão" defaultValue={w.cor} className="!p-1" />
          <Input name="texto" label="Texto do botão" defaultValue={w.texto} maxLength={40} />
        </div>
      </Grupo>
      <Grupo titulo="Sites autorizados" ajuda="Um domínio por linha (ex.: clinicasorriso.com.br). Subdomínios entram junto. Em branco, qualquer site pode usar o código.">
        <Area name="dominios" defaultValue={(w.dominios ?? []).join("\n")} rows={3} placeholder="suaempresa.com.br" />
      </Grupo>
      <Grupo titulo="Instalação" ajuda="Cole antes de </body> em todas as páginas. Salve e publique para as mudanças valerem no site.">
        <pre className="overflow-x-auto rounded-[12px] border border-border bg-background p-3 font-mono text-xs text-muted-foreground">{snippet}</pre>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(snippet).then(() => setCopiado(true))}
            className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3 text-sm hover:bg-accent"
          >
            {copiado ? "Copiado" : "Copiar código"}
          </button>
          <a href={`/widget/${agenteId}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-full border border-border bg-background px-3 text-sm hover:bg-accent">
            Abrir prévia ↗
          </a>
        </div>
      </Grupo>
    </Form>
  );
}

const CATEGORIAS_VOZ = [
  { id: "todas", rotulo: "Todas", teste: () => true },
  { id: "acolhedora", rotulo: "Acolhedoras", teste: (v: Voice) => /acolhed|calma|simp|amig/i.test(v.style) },
  { id: "formal", rotulo: "Formais", teste: (v: Voice) => /formal|execut|seguro|confiante/i.test(v.style) },
  { id: "expressiva", rotulo: "Expressivas", teste: (v: Voice) => /expressiv|cordial/i.test(v.style) },
  { id: "feminina", rotulo: "Femininas", teste: (v: Voice) => v.gender === "feminina" },
  { id: "masculina", rotulo: "Masculinas", teste: (v: Voice) => v.gender === "masculina" },
];

const ESCOLHIDAS = [
  { titulo: "Ideais para clínicas", foto: "/fotos/clinica.jpg", voz: "clara", fundo: "linear-gradient(135deg,#bbf7d0,#a5f3fc)" },
  { titulo: "Para imobiliárias", foto: "/fotos/imobiliaria.jpg", voz: "tomas", fundo: "linear-gradient(135deg,#dbeafe,#e0e7ff)" },
  { titulo: "Restaurantes e reservas", foto: "/fotos/restaurante.jpg", voz: "otavio", fundo: "linear-gradient(135deg,#fde68a,#fbcfe8)" },
  { titulo: "Atendimento caloroso", foto: "/fotos/atendimento.jpg", voz: "lia", fundo: "linear-gradient(135deg,#fecaca,#fed7aa)" },
];

/** ElevenLabs-style voice explorer: search, category chips, trending list with avatars, handpicked cards. */
function VozesExplorar({
  voz,
  setVoz,
  tocando,
  ouvir,
  motoresAtivos,
}: {
  voz: string;
  setVoz: (v: string) => void;
  tocando: string | null;
  ouvir: (id: string) => Promise<void>;
  motoresAtivos: Record<MotorVoz, boolean>;
}) {
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("todas");
  const filtro = CATEGORIAS_VOZ.find((c) => c.id === cat)!;
  const lista = VOICES.filter((v) => filtro.teste(v) && `${v.name} ${v.style} ${v.accent}`.toLowerCase().includes(busca.toLowerCase()));
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 rounded-[12px] border border-foreground/80 bg-white px-3">
        <Search size={15} className="text-muted-foreground" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar vozes…" aria-label="Buscar vozes" className="h-10 flex-1 bg-transparent text-base outline-none sm:text-sm" />
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {CATEGORIAS_VOZ.map((c) => (
          <button key={c.id} type="button" onClick={() => setCat(c.id)} className={cn("shrink-0 rounded-[10px] border px-3 py-1.5 text-[0.8125rem] whitespace-nowrap", cat === c.id ? "border-foreground bg-foreground text-white" : "border-border bg-white hover:bg-accent")}>
            {c.rotulo}
          </button>
        ))}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Em alta</p>
        <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {lista.map((v) => {
            const ativo = motoresAtivos[v.motor];
            return (
              <li key={v.id}>
                <div
                  role="radio"
                  aria-checked={voz === v.id}
                  aria-disabled={!ativo}
                  tabIndex={0}
                  onClick={() => ativo && setVoz(v.id)}
                  onKeyDown={(e) => ativo && (e.key === " " || e.key === "Enter") && setVoz(v.id)}
                  className={cn("group flex items-center gap-3 rounded-[14px] p-2 transition-colors", ativo ? "cursor-pointer hover:bg-accent" : "cursor-not-allowed opacity-45", voz === v.id && "bg-accent outline-2 outline-foreground")}
                >
                  <span className="relative grid size-12 shrink-0 place-items-center rounded-[12px] bg-muted">
                    <Orb tom={v.tone} tamanho={34} />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void ouvir(v.id);
                      }}
                      aria-label={`Ouvir ${v.name}`}
                      className={cn("absolute inset-0 grid place-items-center rounded-[12px] bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100", tocando === v.id && "opacity-100")}
                    >
                      {tocando === v.id ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    {v.motor === "premium" && <BadgeCheck size={14} className="absolute -right-1 -bottom-1 rounded-full bg-white text-foreground" aria-label="Premium" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{v.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {v.style} · {MOTORES[v.motor].nome}
                      {!ativo && " · motor não conectado"}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <span aria-hidden>🇧🇷</span> Português · {v.accent}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
          {!lista.length && <li className="text-sm text-muted-foreground">Nenhuma voz com esse filtro.</li>}
        </ul>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Escolhidas pra você</p>
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {ESCOLHIDAS.map((e) => (
            <button
              key={e.titulo}
              type="button"
              onClick={() => motoresAtivos[VOICES.find((v) => v.id === e.voz)?.motor ?? "premium"] && setVoz(e.voz)}
              className="group relative h-36 w-64 shrink-0 snap-start overflow-hidden rounded-[18px] text-left"
              style={{ background: e.fundo }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.foto} alt="" loading="lazy" onError={(x) => ((x.target as HTMLImageElement).style.display = "none")} className="absolute inset-y-0 left-0 h-full w-[46%] object-cover [mask-image:linear-gradient(90deg,#000_70%,transparent)]" />
              <span className="absolute inset-y-0 right-0 flex w-[58%] flex-col justify-center bg-gradient-to-l from-white/95 via-white/85 to-transparent pr-4 pl-6">
                <span className="text-[1.0625rem] leading-tight font-semibold tracking-[-0.02em]">{e.titulo}</span>
                <span className="mt-1 text-xs text-muted-foreground">Voz: {VOICES.find((v) => v.id === e.voz)?.name}</span>
              </span>
              <span className="absolute right-3 bottom-3 grid size-6 place-items-center rounded-full bg-foreground text-white">
                <ArrowRight size={12} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
