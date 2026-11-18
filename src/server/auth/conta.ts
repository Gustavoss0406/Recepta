import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { NICHOS } from "@/lib/agent/config";
import { iniciarTrial } from "@/server/billing/assinaturas";
import { hashSenha, verificarSenha } from "./password";

export const novaContaSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres"),
  empresa: z.string().trim().min(2, "Informe o nome da empresa"),
  nicho: z.enum(NICHOS),
});

export type NovaConta = z.infer<typeof novaContaSchema>;

export class ErroConta extends Error {}

/** Creates user + organization (as owner) + 7-day trial, atomically. */
export async function criarConta(dados: NovaConta) {
  const d = novaContaSchema.parse(dados);
  const db = getDb();
  const [existe] = await db.select({ id: schema.usuarios.id }).from(schema.usuarios).where(eq(schema.usuarios.email, d.email));
  if (existe) throw new ErroConta("Já existe uma conta com este e-mail.");
  const senhaHash = await hashSenha(d.senha);

  return db.transaction(async (tx) => {
    const [u] = await tx.insert(schema.usuarios).values({ email: d.email, nome: d.nome, senhaHash }).returning();
    const [o] = await tx.insert(schema.organizacoes).values({ nome: d.empresa, nicho: d.nicho }).returning();
    await tx.insert(schema.membros).values({ orgId: o.id, usuarioId: u.id, papel: "dono" });
    await iniciarTrial(o.id, tx);
    await tx.insert(schema.auditoria).values({ orgId: o.id, usuarioId: u.id, acao: "conta.criada" });
    return { usuarioId: u.id, orgId: o.id };
  });
}

export async function autenticar(email: string, senha: string) {
  const db = getDb();
  const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email.trim().toLowerCase()));
  if (!u || !(await verificarSenha(senha, u.senhaHash))) throw new ErroConta("E-mail ou senha incorretos.");
  const [m] = await db.select({ orgId: schema.membros.orgId }).from(schema.membros).where(eq(schema.membros.usuarioId, u.id)).limit(1);
  return { usuarioId: u.id, orgId: m?.orgId ?? null };
}
