import type { AgentConfig, Objetivo } from "./config";

export const SECOES = ["empresa", "comportamento", "voz", "acoes", "horarios", "dados", "seguranca", "widget"] as const;
export type Secao = (typeof SECOES)[number];

const linhas = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const b = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";

export function servicosParaTexto(sv: AgentConfig["empresa"]["servicos"]) {
  return sv.map((x) => [x.nome, x.preco, x.duracaoMin ? `${x.duracaoMin} min` : ""].filter(Boolean).join(" | ")).join("\n");
}

function servicosDeTexto(t: FormDataEntryValue | null): AgentConfig["empresa"]["servicos"] {
  return linhas(t).map((l) => {
    const [nome, preco, dur] = l.split("|").map((x) => x.trim());
    const n = dur ? parseInt(dur, 10) : undefined;
    return { nome, ...(preco ? { preco } : {}), ...(n ? { duracaoMin: n } : {}) };
  });
}

/** FormData of one editor section → config patch (validated later by the zod schema). */
export function patchDeForm(secao: Secao, fd: FormData, atual: AgentConfig): Partial<AgentConfig> {
  switch (secao) {
    case "empresa":
      return {
        empresa: {
          ...atual.empresa,
          nome: s(fd, "nome") || atual.empresa.nome,
          cidade: s(fd, "cidade"),
          endereco: s(fd, "endereco"),
          telefone: s(fd, "telefone"),
          servicos: servicosDeTexto(fd.get("servicos")),
          formasPagamento: linhas(fd.get("formasPagamento")),
          convenios: linhas(fd.get("convenios")),
          observacoes: s(fd, "observacoes"),
        },
      };
    case "comportamento":
      return {
        comportamento: {
          nomeAgente: s(fd, "nomeAgente"),
          saudacao: s(fd, "saudacao"),
          objetivos: fd.getAll("objetivos").map(String) as Objetivo[],
          fazer: linhas(fd.get("fazer")),
          nuncaFazer: linhas(fd.get("nuncaFazer")),
          quandoTransferir: linhas(fd.get("quandoTransferir")),
          tom: s(fd, "tom") as AgentConfig["comportamento"]["tom"],
          instrucoesExtras: s(fd, "instrucoesExtras"),
        },
        modelo: (s(fd, "modelo") || atual.modelo) as AgentConfig["modelo"],
      };
    case "voz": {
      const termos = fd.getAll("termo").map(String);
      const falar = fd.getAll("falar").map(String);
      return {
        voz: {
          vozId: s(fd, "vozId"),
          velocidade: Number(s(fd, "velocidade") || 1),
          ultra: b(fd, "ultra"),
          pronuncias: termos.map((t, i) => ({ termo: t.trim(), falar: (falar[i] ?? "").trim() })).filter((p) => p.termo && p.falar),
        },
      };
    }
    case "acoes": {
      const nomes = fd.getAll("wh_nome").map(String);
      const webhooks = nomes
        .map((nome, i) => ({
          nome: nome.trim(),
          descricao: String(fd.getAll("wh_descricao")[i] ?? "").trim(),
          url: String(fd.getAll("wh_url")[i] ?? "").trim(),
          parametros: String(fd.getAll("wh_parametros")[i] ?? "")
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p) => ({ nome: p.replace(/\*$/, ""), descricao: p.replace(/\*$/, ""), obrigatorio: p.endsWith("*") })),
        }))
        .filter((w) => w.nome);
      return {
        acoes: {
          agendar: { ativo: b(fd, "agendar"), agenda: (s(fd, "agenda") || "interna") as "interna" | "google", duracaoPadraoMin: Number(s(fd, "duracao") || 30) },
          transferir: { ativo: b(fd, "transferir"), numero: s(fd, "numeroTransferencia"), somenteHorarioComercial: b(fd, "somenteHorario") },
          whatsapp: { ativo: b(fd, "whatsapp") },
          repassar: { notificar: (s(fd, "notificar") || "ambos") as "whatsapp" | "email" | "ambos" },
          webhooks,
        },
      };
    }
    case "horarios":
      return {
        horarios: {
          semana: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
            aberto: b(fd, `aberto_${d}`),
            inicio: s(fd, `inicio_${d}`) || "08:00",
            fim: s(fd, `fim_${d}`) || "18:00",
          })),
          feriados: linhas(fd.get("feriados")).filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l)),
          foraDoHorario: (s(fd, "foraDoHorario") || "atender") as "recado" | "atender",
        },
      };
    case "dados": {
      const rotulos = fd.getAll("rotulo").map(String);
      return {
        dados: {
          campos: rotulos
            .map((rotulo, i) => ({
              chave:
                String(fd.getAll("chave")[i] ?? "").trim() ||
                rotulo
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[̀-ͯ]/g, "")
                  .replace(/[^a-z]+/g, "_")
                  .replace(/^_|_$/g, ""),
              rotulo: rotulo.trim(),
              tipo: String(fd.getAll("tipo")[i] ?? "texto") as "texto",
              obrigatorio: String(fd.getAll("obrigatorio")[i] ?? "") === "sim",
            }))
            .filter((c) => c.rotulo),
        },
      };
    }
    case "seguranca":
      return {
        seguranca: {
          temasProibidos: linhas(fd.get("temasProibidos")),
          duracaoMaxMin: Number(s(fd, "duracaoMaxMin") || 15),
          silencioEncerrarS: Number(s(fd, "silencioEncerrarS") || 20),
          bloquearSpam: b(fd, "bloquearSpam"),
        },
      };
    case "widget":
      return {
        widget: {
          cor: /^#[0-9a-f]{6}$/i.test(s(fd, "cor")) ? s(fd, "cor") : "#000000",
          texto: (s(fd, "texto") || "Fale com a gente").slice(0, 40),
          ativo: b(fd, "ativo"),
          dominios: s(fd, "dominios")
            .split(/[\s,]+/)
            .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
            .filter(Boolean)
            .slice(0, 20),
        },
      };
  }
}
