import "server-only";
import { z } from "zod";
import { getLlm } from "@/server/providers/llm";
import { rastrearSite } from "@/server/crawler/crawl";
import { rastrearEmpresa, textoDoPerfil, usuarioInstagram, type PerfilPublico } from "@/server/empresa/rastreio";
import { CAMPOS_DA_ANALISE, type ResultadoAnalise } from "@/lib/onboarding/conversa";
import { CAMPOS, type Perfil } from "@/lib/onboarding/perfil";

const comPrazo = <T,>(p: Promise<T>, ms: number, padrao: T) => Promise.race([p.catch(() => padrao), new Promise<T>((r) => setTimeout(() => r(padrao), ms))]);

const esquema = z.object({
  campos: z.record(z.string(), z.string()).default({}),
  achados: z.array(z.string()).default([]),
});

const SYSTEM = `Você analisa o site e as redes de uma empresa para configurar a recepcionista virtual dela.
Extraia SÓ fatos que estão escritos no material (nunca invente nem deduza preço, horário ou serviço).
"campos": preencha as chaves pedidas que o material responde, no formato da descrição. Omita as que não estiverem lá.
"achados": até 5 frases curtíssimas e informais do que você encontrou de mais útil (ex.: "atendem Cambuí e Taquaral", "abrem de seg a sex das 9h às 18h", "4,8 estrelas no Google"). Português do Brasil.`;

/** Reads the site + public profile right now and turns it into onboarding answers. */
export async function analisarEmpresa(p: Perfil, entrada: { site?: string; instagram?: string }): Promise<ResultadoAnalise> {
  const site = entrada.site?.trim() || undefined;
  const ig = usuarioInstagram(entrada.instagram) ?? undefined;
  const instagram = ig ? `@${ig}` : undefined;
  if (!site && !instagram) return { campos: {}, achados: [] };

  const [paginas, publico] = await Promise.all([
    site ? comPrazo(rastrearSite(site, { maxPaginas: 6, prazoMs: 14_000 }).then((r) => r.paginas), 16_000, []) : Promise.resolve([]),
    comPrazo<PerfilPublico | null>(rastrearEmpresa({ nome: p.campos.empresa_nome, cidade: p.campos.cidade, site, instagram }), 18_000, null),
  ]);
  const material = [
    ...paginas.map((x) => `# ${x.titulo}\n${x.descricao}\n${x.texto}`),
    publico ? textoDoPerfil(publico) : "",
  ]
    .join("\n\n")
    .slice(0, 12_000);

  const local = deduzirLocal(publico);
  if (material.trim().length < 40) return { site, instagram, ...local };
  try {
    const llm = await getLlm();
    if (!llm.real) return { site, instagram, ...local };
    const chaves = CAMPOS_DA_ANALISE.map((k) => `- ${k}: ${CAMPOS[k]}`).join("\n");
    const { dados } = await llm.estruturado({
      modelo: "claude-haiku-5-5",
      system: SYSTEM,
      prompt: `Empresa: ${p.campos.empresa_nome ?? ""} (${p.campos.segmento ?? ""}, ${p.campos.cidade ?? ""}).\nChaves:\n${chaves}\n\nMaterial:\n${material}`,
      schema: esquema,
      maxTokens: 900,
      qualidade: "maxima",
    });
    const campos = Object.fromEntries(Object.entries({ ...local.campos, ...dados.campos }).filter(([k, v]) => CAMPOS_DA_ANALISE.includes(k) && typeof v === "string" && v.trim() && !/^(null|n\/a|desconhecido|não informado)$/i.test(v.trim())));
    return { site, instagram, campos, achados: [...new Set([...dados.achados, ...local.achados])].slice(0, 6) };
  } catch {
    return { site, instagram, ...local };
  }
}

/** What can be read without a model (hours, rating, followers). */
function deduzirLocal(p: PerfilPublico | null): { campos: Record<string, string>; achados: string[] } {
  if (!p) return { campos: {}, achados: [] };
  const campos: Record<string, string> = {};
  const achados: string[] = [];
  if (p.horarios?.length) {
    campos.horario = p.horarios.join("; ");
    achados.push(`horário: ${p.horarios.slice(0, 2).join("; ")}`);
  }
  if (p.avaliacao) achados.push(`${String(p.avaliacao.nota).replace(".", ",")} estrelas${p.avaliacao.total ? ` (${p.avaliacao.total} avaliações)` : ""}`);
  if (p.instagram?.seguidores) achados.push(`${p.instagram.seguidores} seguidores no Instagram`);
  if (p.endereco) achados.push(`endereço: ${p.endereco}`);
  if (p.whatsapp.length) achados.push("WhatsApp no site");
  return { campos, achados };
}
