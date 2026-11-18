"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { exigirPermissao, exigirSessao } from "@/server/auth/session";
import {
  criarAgente,
  ErroAgente,
  obterAgente,
  primeiroAgente,
  publicar,
  restaurarVersao,
  salvarRascunho,
} from "@/server/agent/agentes";
import { adicionarTexto, buscarConhecimento, indexarSite, removerFonte } from "@/server/agent/conhecimento";
import { patchDeForm, type Secao } from "@/lib/agent/form";
import { NICHOS, type Nicho } from "@/lib/agent/config";
import { aplicarPerfilExtraido, extrairPerfilEmpresa } from "@/server/agent/perfil";
import { rodarGatePublicacao } from "@/server/testes/suite";
import { validarWorkflow, workflowSchema } from "@/lib/agent/workflow";
import { encerrarExperimento, iniciarExperimento, PLANOS_COM_AB } from "@/server/agent/experimentos";
import { obterAssinatura } from "@/server/billing/assinaturas";

export type Resultado = { ok?: boolean; erro?: string; mensagem?: string } | undefined;

const erroDe = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado. Tente de novo.");

/* ───────── Onboarding ───────── */

export async function onboardingEmpresa(_: Resultado, fd: FormData): Promise<Resultado> {
  const s = await exigirPermissao("editarAgente");
  const nome = String(fd.get("nome") ?? "").trim();
  const nicho = String(fd.get("nicho") ?? s.org.nicho) as Nicho;
  if (nome.length < 2 || !NICHOS.includes(nicho)) return { erro: "Informe o nome e o tipo de negócio." };
  const db = getDb();
  await db
    .update(schema.organizacoes)
    .set({
      nome,
      nicho,
      cnpj: String(fd.get("cnpj") ?? "").trim() || null,
      cidade: String(fd.get("cidade") ?? "").trim() || null,
      telefoneContato: String(fd.get("telefoneContato") ?? "").trim() || null,
      onboardingPasso: 2,
    })
    .where(eq(schema.organizacoes.id, s.org.id));
  if (!(await primeiroAgente(s.org.id))) await criarAgente(s.org.id, nicho, { nome, cidade: String(fd.get("cidade") ?? "") });
  redirect("/painel/comecar?passo=2");
}

export async function onboardingSite(_: Resultado, fd: FormData): Promise<Resultado> {
  const s = await exigirPermissao("editarAgente");
  const agente = await primeiroAgente(s.org.id);
  if (!agente) return { erro: "Complete o passo 1 primeiro." };
  const url = String(fd.get("url") ?? "").trim();
  const texto = String(fd.get("texto") ?? "").trim();
  try {
    if (url) {
      const r = await indexarSite(s.org.id, agente.id, url);
      const perfil = await extrairPerfilEmpresa(r);
      await salvarRascunho(s.org.id, agente.id, { empresa: aplicarPerfilExtraido(agente.rascunho.empresa, perfil) });
    } else if (texto) {
      await adicionarTexto(s.org.id, agente.id, "Informações da empresa", texto);
    } else return { erro: "Cole o endereço do site ou escreva as informações da empresa." };
  } catch (e) {
    return { erro: erroDe(e) };
  }
  await getDb().update(schema.organizacoes).set({ onboardingPasso: 2 }).where(eq(schema.organizacoes.id, s.org.id));
  redirect("/painel/comecar?passo=2&lido=1");
}

export async function onboardingAvancar(passo: number) {
  const s = await exigirSessao();
  await getDb()
    .update(schema.organizacoes)
    .set({ onboardingPasso: passo })
    .where(eq(schema.organizacoes.id, s.org.id));
  redirect(`/painel/comecar?passo=${passo}`);
}

/** Saves a section from inside the wizard, then moves to the next step. */
export async function onboardingSecao(secao: Secao, proximo: number, _: Resultado, fd: FormData): Promise<Resultado> {
  const r = await salvarSecaoInterno(secao, fd);
  if (r?.erro) return r;
  await onboardingAvancar(proximo);
}

/* ───────── Editor ───────── */

async function salvarSecaoInterno(secao: Secao, fd: FormData, agenteId?: string): Promise<Resultado> {
  const s = await exigirPermissao("editarAgente");
  const id = agenteId ?? (await primeiroAgente(s.org.id))?.id;
  if (!id) return { erro: "Agente não encontrado" };
  try {
    const a = await obterAgente(s.org.id, id);
    await salvarRascunho(s.org.id, id, patchDeForm(secao, fd, a.rascunho), String(fd.get("nomeInterno") ?? "") || undefined);
  } catch (e) {
    return { erro: e instanceof ErroAgente ? traduzirErro(e.message) : erroDe(e) };
  }
  revalidatePath(`/painel/agentes/${id}`);
  return { ok: true, mensagem: "Rascunho salvo" };
}

function traduzirErro(m: string) {
  if (m.includes("saudacao")) return "A saudação está inválida.";
  return m;
}

export async function salvarSecao(agenteId: string, secao: Secao, _: Resultado, fd: FormData): Promise<Resultado> {
  return salvarSecaoInterno(secao, fd, agenteId);
}

export async function acaoPublicar(agenteId: string, _: Resultado, fd: FormData): Promise<Resultado> {
  const s = await exigirPermissao("publicar");
  const forcar = fd.get("forcar") === "on";
  try {
    const gate = await rodarGatePublicacao(s.org.id, agenteId);
    const v = await publicar(s.org.id, agenteId, { id: s.usuario.id, papel: s.papel }, { nota: String(fd.get("nota") ?? "") || undefined, forcar, gate });
    revalidatePath(`/painel/agentes/${agenteId}`);
    if (fd.get("onboarding") === "1") {
      await getDb()
        .update(schema.organizacoes)
        .set({ onboardingConcluido: true, onboardingPasso: 7 })
        .where(eq(schema.organizacoes.id, s.org.id));
      redirect("/painel?publicado=1");
    }
    return { ok: true, mensagem: `Versão ${v.numero} publicada${gate.falhasCriticas.length ? " (forçada)" : ""}.` };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect
    return { erro: erroDe(e) };
  }
}

export async function acaoRestaurar(agenteId: string, versaoId: string) {
  const s = await exigirPermissao("publicar");
  await restaurarVersao(s.org.id, agenteId, versaoId, { id: s.usuario.id, papel: s.papel });
  revalidatePath(`/painel/agentes/${agenteId}`);
}

export async function acaoPausar(agenteId: string, pausar: boolean) {
  const s = await exigirPermissao("publicar");
  const a = await obterAgente(s.org.id, agenteId);
  await getDb()
    .update(schema.agentes)
    .set({ status: pausar ? "pausado" : a.versaoPublicadaId ? "publicado" : "rascunho" })
    .where(eq(schema.agentes.id, agenteId));
  revalidatePath(`/painel/agentes/${agenteId}`);
}

export async function acaoNovoAgente(fd: FormData) {
  const s = await exigirPermissao("editarAgente");
  const nicho = (String(fd.get("nicho") ?? s.org.nicho) as Nicho) || "clinica";
  const a = await criarAgente(s.org.id, nicho, { nome: s.org.nome });
  redirect(`/painel/agentes/${a.id}`);
}

/* ───────── Conhecimento ───────── */

export async function acaoAdicionarTexto(agenteId: string, _: Resultado, fd: FormData): Promise<Resultado> {
  const s = await exigirPermissao("editarAgente");
  const titulo = String(fd.get("titulo") ?? "").trim() || "Texto";
  const texto = String(fd.get("texto") ?? "").trim();
  if (texto.length < 10) return { erro: "Escreva pelo menos uma frase." };
  await obterAgente(s.org.id, agenteId);
  await adicionarTexto(s.org.id, agenteId, titulo, texto, fd.get("tipo") === "faq" ? "faq" : "texto");
  revalidatePath(`/painel/agentes/${agenteId}`);
  return { ok: true, mensagem: "Adicionado ao conhecimento" };
}

export async function acaoReindexarSite(agenteId: string, _: Resultado, fd: FormData): Promise<Resultado> {
  const s = await exigirPermissao("editarAgente");
  await obterAgente(s.org.id, agenteId);
  try {
    const r = await indexarSite(s.org.id, agenteId, String(fd.get("url") ?? ""));
    revalidatePath(`/painel/agentes/${agenteId}`);
    return { ok: true, mensagem: `${r.paginas} páginas lidas` };
  } catch (e) {
    return { erro: erroDe(e) };
  }
}

export async function acaoRemoverFonte(agenteId: string, fonteId: string) {
  const s = await exigirPermissao("editarAgente");
  await removerFonte(s.org.id, fonteId);
  revalidatePath(`/painel/agentes/${agenteId}`);
}

export async function acaoPerguntarConhecimento(agenteId: string, pergunta: string) {
  const s = await exigirSessao();
  await obterAgente(s.org.id, agenteId);
  return buscarConhecimento(agenteId, pergunta, 3);
}

/* ───────── Recados / alertas ───────── */

export async function acaoMarcarRecadoLido(recadoId: string) {
  const s = await exigirSessao();
  await getDb()
    .update(schema.recados)
    .set({ lido: true })
    .where(and(eq(schema.recados.orgId, s.org.id), eq(schema.recados.id, recadoId)));
  revalidatePath("/painel");
}

/** Saves the visual workflow of the draft. An active flow must pass validation. */
export async function acaoSalvarWorkflow(agenteId: string, dados: unknown): Promise<Resultado & { problemas?: string[] }> {
  const s = await exigirPermissao("editarAgente");
  const p = workflowSchema.safeParse(dados);
  if (!p.success) return { erro: "Fluxo inválido." };
  const problemas = validarWorkflow(p.data);
  if (problemas.length) return { erro: "Corrija o fluxo antes de ativar.", problemas };
  try {
    await obterAgente(s.org.id, agenteId);
    await salvarRascunho(s.org.id, agenteId, { workflow: p.data });
  } catch (e) {
    return { erro: e instanceof ErroAgente ? traduzirErro(e.message) : erroDe(e) };
  }
  revalidatePath(`/painel/agentes/${agenteId}`);
  return { ok: true, mensagem: p.data.ativo ? "Fluxo salvo no rascunho (ativo)" : "Fluxo salvo no rascunho (desligado)" };
}

async function exigirPlanoAB(orgId: string) {
  const a = await obterAssinatura(orgId);
  if (!PLANOS_COM_AB.includes(a.planoId)) throw new ErroAgente("Experimentos A/B estão disponíveis no plano Business.");
}

export async function acaoIniciarExperimento(agenteId: string, _: Resultado, fd: FormData): Promise<Resultado> {
  const s = await exigirPermissao("publicar");
  try {
    await exigirPlanoAB(s.org.id);
    await iniciarExperimento(s.org.id, agenteId, String(fd.get("versaoB") ?? ""), Number(fd.get("percentual") ?? 50));
  } catch (e) {
    return { erro: e instanceof ErroAgente ? e.message : erroDe(e) };
  }
  revalidatePath(`/painel/agentes/${agenteId}`);
  return { ok: true, mensagem: "Experimento iniciado" };
}

export async function acaoEncerrarExperimento(agenteId: string, promover: "A" | "B") {
  const s = await exigirPermissao("publicar");
  await encerrarExperimento(s.org.id, agenteId, { promover, autor: { id: s.usuario.id, papel: s.papel } });
  revalidatePath(`/painel/agentes/${agenteId}`);
}

/* ───────── Configuration assistant ───────── */

export type ResultadoAssistente = { erro?: string; resumo?: string; secoes?: import("@/lib/agent/assistente").Secao[]; proposta?: unknown } | undefined;

export async function acaoProporMudancas(agenteId: string, pedido: string): Promise<ResultadoAssistente> {
  const s = await exigirPermissao("editarAgente");
  try {
    const { proporMudancas } = await import("@/server/agent/assistente");
    const r = await proporMudancas(s.org.id, agenteId, pedido);
    return r.secoes.length ? r : { erro: "Não encontrei nada para mudar com esse pedido. Tente dar mais detalhes." };
  } catch (e) {
    return { erro: erroDe(e) };
  }
}

export async function acaoAplicarMudancas(agenteId: string, proposta: unknown, secoes: string[]): Promise<Resultado> {
  const s = await exigirPermissao("editarAgente");
  const validas = ["empresa", "saudacao", "objetivos", "regras", "dados", "horarios", "acoes"] as const;
  const escolhidas = secoes.filter((x): x is (typeof validas)[number] => (validas as readonly string[]).includes(x));
  if (!escolhidas.length) return { erro: "Escolha ao menos uma seção." };
  try {
    const { aplicarMudancas } = await import("@/server/agent/assistente");
    await aplicarMudancas(s.org.id, agenteId, proposta, escolhidas);
  } catch (e) {
    return { erro: e instanceof ErroAgente ? traduzirErro(e.message) : erroDe(e) };
  }
  revalidatePath(`/painel/agentes/${agenteId}`);
  revalidatePath("/painel/comecar");
  return { ok: true, mensagem: `${escolhidas.length} seção(ões) aplicada(s) no rascunho. Teste antes de publicar.` };
}

/* ───────── Hand-off between receptionists ───────── */

export async function acaoSalvarColegas(agenteId: string, colegas: { agenteId: string; quando: string }[]): Promise<Resultado> {
  const s = await exigirPermissao("editarAgente");
  try {
    const { listarAgentes } = await import("@/server/agent/agentes");
    const todos = await listarAgentes(s.org.id);
    const lista = colegas
      .filter((c) => c.agenteId !== agenteId && c.quando.trim().length >= 3)
      .slice(0, 5)
      .map((c) => {
        const a = todos.find((x) => x.id === c.agenteId);
        if (!a) throw new ErroAgente("Recepcionista não encontrada");
        return { agenteId: a.id, nome: a.rascunho.comportamento.nomeAgente, quando: c.quando.trim().slice(0, 200) };
      });
    const atual = (await obterAgente(s.org.id, agenteId)).rascunho.acoes;
    await salvarRascunho(s.org.id, agenteId, { acoes: { ...atual, colegas: lista } });
  } catch (e) {
    return { erro: e instanceof ErroAgente ? traduzirErro(e.message) : erroDe(e) };
  }
  revalidatePath(`/painel/agentes/${agenteId}`);
  return { ok: true, mensagem: "Salvo no rascunho. Publique as duas recepcionistas para valer nas ligações." };
}

/* ───────── API tools (business systems) ───────── */

const RESERVADOS = ["consultar_agendamentos", "remarcar_agendamento", "cancelar_agendamento", "consultar_cadastro_cliente", "consultar_horarios", "agendar", "transferir_para_humano", "repassar_para_equipe", "enviar_whatsapp", "encerrar_ligacao", "seguir_fluxo", "passar_para_colega", "anotar_recado", "sinalizar_revisao"];

export type ResultadoApiDono = Resultado & { camposDisponiveis?: string[]; dados?: unknown; status?: number };

/** Saves (creates or replaces) one API tool; the secret header is stored encrypted, apart from the config. */
export async function acaoSalvarFerramentaApi(agenteId: string, dados: unknown, segredo?: { cabecalho: string; valor: string }): Promise<Resultado> {
  const s = await exigirPermissao("editarAgente");
  const { ferramentaApiSchema } = await import("@/lib/agent/api-ferramenta");
  const p = ferramentaApiSchema.safeParse(dados);
  if (!p.success) return { erro: p.error.issues.map((i) => i.message).join("; ") };
  if (RESERVADOS.includes(p.data.nome)) return { erro: "Esse nome é de uma ação da própria Recepta. Escolha outro." };
  if (!p.data.url.startsWith("https://")) return { erro: "Use um endereço https://" };
  try {
    const atual = (await obterAgente(s.org.id, agenteId)).rascunho.acoes;
    const outras = (atual.apis ?? []).filter((x) => x.id !== p.data.id);
    if (outras.some((x) => x.nome === p.data.nome) || atual.webhooks.some((w) => w.nome === p.data.nome)) return { erro: "Já existe uma ação com esse nome." };
    if (segredo?.valor) {
      const { salvarCredencialApi } = await import("@/server/agent/api-ferramentas");
      await salvarCredencialApi(s.org.id, p.data.id, segredo.cabecalho || "Authorization", segredo.valor);
    }
    const temCredencial = Boolean(segredo?.valor) || (atual.apis ?? []).find((x) => x.id === p.data.id)?.temCredencial || false;
    await salvarRascunho(s.org.id, agenteId, { acoes: { ...atual, apis: [...outras, { ...p.data, temCredencial }] } });
  } catch (e) {
    return { erro: e instanceof ErroAgente ? traduzirErro(e.message) : erroDe(e) };
  }
  revalidatePath(`/painel/agentes/${agenteId}`);
  return { ok: true, mensagem: "Ferramenta salva no rascunho." };
}

export async function acaoRemoverFerramentaApi(agenteId: string, id: string): Promise<Resultado> {
  const s = await exigirPermissao("editarAgente");
  const atual = (await obterAgente(s.org.id, agenteId)).rascunho.acoes;
  await salvarRascunho(s.org.id, agenteId, { acoes: { ...atual, apis: (atual.apis ?? []).filter((x) => x.id !== id) } });
  const { salvarCredencialApi } = await import("@/server/agent/api-ferramentas");
  await salvarCredencialApi(s.org.id, id, "Authorization", "");
  revalidatePath(`/painel/agentes/${agenteId}`);
  return { ok: true };
}

/** "Testar" for the owner: real call (also for "registrar", it's the owner asking), shows every field returned. */
export async function acaoTestarFerramentaApi(agenteId: string, id: string, args: Record<string, string>): Promise<ResultadoApiDono> {
  const s = await exigirPermissao("editarAgente");
  const f = (await obterAgente(s.org.id, agenteId)).rascunho.acoes.apis?.find((x) => x.id === id);
  if (!f) return { erro: "Salve a ferramenta antes de testar." };
  const { executarApi } = await import("@/server/agent/api-ferramentas");
  const r = await executarApi(s.org.id, f, args, { paraDono: true });
  return r.ok ? { ok: true, mensagem: `Respondeu ${r.status}`, dados: r.dados, camposDisponiveis: r.camposDisponiveis, status: r.status } : { erro: r.erro };
}
