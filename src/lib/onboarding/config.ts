import type { AgentConfig, Nicho } from "@/lib/agent/config";
import { gerarFluxo } from "./gerador";
import { brl, ehNao, lerHorario, lista, telefone, type Perfil } from "./perfil";

/** Business category → the agent niche used for templates and the test-scenario library. */
export function nichoDoPerfil(p: Perfil): Nicho {
  const c = p.campos.categoria;
  return c === "imobiliaria" || c === "restaurante" ? c : "clinica";
}

/** Everything the onboarding learned, applied on top of the niche's default config. */
export function configDoPerfil(base: AgentConfig, p: Perfil): AgentConfig {
  const f = p.campos;
  const sim = (k: string) => Boolean(f[k]) && !ehNao(f[k]);
  const nomeEmpresa = f.empresa_nome || base.empresa.nome;
  const nomeAgente = (f.recep_nome || base.comportamento.nomeAgente).slice(0, 30);
  const numTransfer = f.pessoa === "transferir" && f.transferir_numero && !ehNao(f.transferir_numero) ? (telefone(f.transferir_numero) ?? "") : "";
  const servicos = lista(f.servicos).map((s) => {
    const preco = /R\$\s*[\d.,]+(?:\s*(?:mil|mi|milh\w+))?/i.exec(s)?.[0];
    return { nome: s.replace(/\s*[-–:]?\s*R\$.*$/i, "").trim().slice(0, 80) || s.slice(0, 80), ...(preco ? { preco } : {}) };
  });
  const alto = Number(f.alto_valor);
  const linhas = [
    f.segmento && `Ramo: ${f.segmento}.`,
    sim("motivos") && `Motivos mais comuns das ligações: ${lista(f.motivos).join("; ")}.`,
    sim("regioes") && `Regiões atendidas: ${lista(f.regioes).join(", ")}.`,
    f.operacao && `Operação: ${f.operacao === "ambos" ? "venda e locação" : f.operacao === "locacao" ? "só locação" : "só venda"}.`,
    Number.isFinite(alto) && alto > 0 && `Alto padrão: imóveis a partir de ${brl(alto)} — ${f.alto_acao || "passar para o corretor sênior"}.`,
    f.financiamento && `Financiamento/FGTS: ${f.financiamento === "explica" ? "explique o básico e ofereça simulação com o correspondente" : "passe para o correspondente"}.`,
    sim("visita_requisitos") && `Para visitar: ${f.visita_requisitos}.`,
    sim("especialidades") && `Especialidades: ${lista(f.especialidades).join(", ")}.`,
    sim("retorno") && `Retorno: ${f.retorno}.`,
    sim("receitas") && `Receitas/atestados/exames: ${f.receitas}.`,
    sim("reserva_max") && `Reservas até ${f.reserva_max} pessoas${f.tolerancia ? `, tolerância de ${f.tolerancia} min` : ""}.`,
    sim("delivery") && `Delivery/retirada: ${f.delivery}.`,
    sim("eventos") && `Eventos e grupos: ${f.eventos}.`,
    sim("alergias") && `Alergias: ${f.alergias}.`,
    f.orcamento && `Orçamento: ${f.orcamento === "telefone" ? "pode passar por telefone com a tabela" : "precisa de avaliação antes"}.`,
    sim("atende_local") && `Atendimento: ${f.atende_local}.`,
    sim("urgencia_srv") && `Urgências: ${f.urgencia_srv}.`,
    sim("garantia") && `Garantia: ${f.garantia}.`,
    sim("vip") && `Clientes VIP: ${f.vip}.`,
    sim("reclamacao") && `Reclamações: ${f.reclamacao}.`,
    sim("cancelamento") && `Cancelamento: ${f.cancelamento}.`,
    f.desconto && (ehNao(f.desconto) ? "Nunca ofereça desconto." : `Desconto: no máximo ${f.desconto}.`),
    sim("sistemas") && `Sistemas da empresa: ${f.sistemas}.`,
    ...p.regras.map((r) => `Quando ${r.quando}: ${r.fazer}.`),
  ].filter(Boolean) as string[];

  return {
    ...base,
    empresa: {
      ...base.empresa,
      nome: nomeEmpresa.slice(0, 80),
      nicho: nichoDoPerfil(p),
      cidade: f.cidade || base.empresa.cidade,
      servicos: servicos.length ? servicos : base.empresa.servicos,
      convenios: f.convenios && !ehNao(f.convenios) ? lista(f.convenios) : f.convenios ? [] : base.empresa.convenios,
      observacoes: [base.empresa.observacoes, sim("site") ? `Site: ${f.site}` : ""].filter(Boolean).join("\n").slice(0, 2000),
    },
    comportamento: {
      ...base.comportamento,
      nomeAgente,
      saudacao: `${nomeEmpresa}, aqui é a ${nomeAgente}, recepcionista virtual. A ligação é gravada. Como posso ajudar?`,
      tom: f.tom === "formal" || f.tom === "descontraido" ? f.tom : "equilibrado",
      nuncaFazer: [...new Set([...base.comportamento.nuncaFazer, ...lista(f.nunca)])].slice(0, 20),
      instrucoesExtras: [base.comportamento.instrucoesExtras, ...linhas].filter(Boolean).join("\n").slice(0, 4000),
    },
    acoes: {
      ...base.acoes,
      agendar: { ...base.acoes.agendar, ativo: f.agenda !== "nao" },
      transferir: { ativo: Boolean(numTransfer), numero: numTransfer, somenteHorarioComercial: true },
      whatsapp: { ativo: f.confirmacao === "sim" || base.acoes.whatsapp.ativo },
      repassar: { notificar: f.aviso === "email" || f.aviso === "whatsapp" ? f.aviso : "ambos" },
    },
    horarios: {
      ...base.horarios,
      semana: f.horario ? lerHorario(f.horario) : base.horarios.semana,
      foraDoHorario: f.fora === "recado" ? "recado" : "atender",
    },
    seguranca: { ...base.seguranca, bloquearSpam: f.vendedores !== "nao" },
    workflow: gerarFluxo(p).workflow,
  };
}
