"use server";

import { revalidatePath } from "next/cache";
import { exigirPermissao } from "@/server/auth/session";
import { obterAgente, salvarRascunho } from "@/server/agent/agentes";
import { IDS_MOTOR, type IdMotor } from "@/lib/agent/motores";
import { chavesMotor, removerChaveMotor, salvarChaveMotor, testarMotor } from "@/server/providers/motor-cliente";

type R = { ok?: boolean; erro?: string; mensagem?: string };

/** Picks the agent's AI engine. A new key is tested with one tiny request before it is saved. */
export async function salvarMotor(agenteId: string, provedor: string, modelo: string, chave: string): Promise<R> {
  const s = await exigirPermissao("editarAgente");
  if (!IDS_MOTOR.includes(provedor as IdMotor)) return { erro: "Motor inválido." };
  const id = provedor as IdMotor;
  await obterAgente(s.org.id, agenteId);
  const m = modelo.trim().slice(0, 80);
  if (id !== "recepia") {
    const k = chave.trim();
    if (k) {
      const t = await testarMotor(id, m, k);
      if (!t.ok) return { erro: t.erro };
      await salvarChaveMotor(s.org.id, id, k);
    } else if (!(await chavesMotor(s.org.id))[id]) return { erro: "Cole a chave de API desse provedor." };
  }
  await salvarRascunho(s.org.id, agenteId, { motor: { provedor: id, modelo: id === "recepia" ? "" : m } });
  revalidatePath(`/painel/agentes/${agenteId}`);
  return { ok: true, mensagem: id === "recepia" ? "Usando a RecepIA." : "Motor conectado e testado. Publique para valer nas ligações." };
}

export async function apagarChaveMotor(agenteId: string, provedor: string): Promise<R> {
  const s = await exigirPermissao("editarAgente");
  if (!IDS_MOTOR.includes(provedor as IdMotor) || provedor === "recepia") return { erro: "Motor inválido." };
  await removerChaveMotor(s.org.id, provedor as IdMotor);
  const a = await obterAgente(s.org.id, agenteId);
  if (a.rascunho.motor?.provedor === provedor) await salvarRascunho(s.org.id, agenteId, { motor: { provedor: "recepia", modelo: "" } });
  revalidatePath(`/painel/agentes/${agenteId}`);
  return { ok: true, mensagem: "Chave removida." };
}
