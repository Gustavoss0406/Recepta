import { z } from "zod";
import { exigirPermissao } from "@/server/auth/session";
import { primeiroAgente } from "@/server/agent/agentes";
import { rastrearEGuardar, rastrearEmpresa } from "@/server/empresa/rastreio";

const corpo = z.object({
  nome: z.string().max(120).optional(),
  cidade: z.string().max(80).optional(),
  site: z.string().max(300).optional(),
  instagram: z.string().max(200).optional(),
  agenteId: z.string().uuid().optional(),
  /** false = only returns what was found (default true: saves it to the receptionist's knowledge). */
  salvar: z.boolean().optional(),
});

/** POST /api/empresa/rastrear — sweeps everything public about the company (site, Instagram, Google, web). */
export async function POST(req: Request) {
  const s = await exigirPermissao("editarAgente");
  const r = corpo.safeParse(await req.json().catch(() => ({})));
  if (!r.success) return Response.json({ erro: "Dados inválidos" }, { status: 400 });
  const e = { nome: r.data.nome ?? s.org.nome, cidade: r.data.cidade, site: r.data.site, instagram: r.data.instagram };
  if (r.data.salvar === false) return Response.json(await rastrearEmpresa(e));
  const agenteId = r.data.agenteId ?? (await primeiroAgente(s.org.id))?.id;
  if (!agenteId) return Response.json(await rastrearEmpresa(e));
  return Response.json(await rastrearEGuardar(s.org.id, agenteId, e));
}
