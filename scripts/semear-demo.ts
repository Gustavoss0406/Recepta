/** Runs scripted customer calls through the real runtime (phone channel) for the tour account. */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { primeiroAgente } from "@/server/agent/agentes";
import { encerrarConversa, iniciarConversa, responder } from "@/server/agent/runtime";

const email = process.argv[2];
const db = getDb();
const [u] = await db.select().from(schema.usuarios).where(eq(schema.usuarios.email, email));
const [m] = await db.select().from(schema.membros).where(eq(schema.membros.usuarioId, u.id));
const agente = (await primeiroAgente(m.orgId))!;

const roteiros: { de: string; falas: string[]; dur: number }[] = [
  { de: "+55 19 99812-4410", falas: ["Oi, queria marcar uma limpeza", "Pode ser o primeiro", "Obrigado, tchau"], dur: 142 },
  { de: "+55 19 98123-0091", falas: ["Vocês aceitam Unimed?", "Obrigada, só isso"], dur: 58 },
  { de: "+55 19 99654-7720", falas: ["Quero agendar uma consulta para semana que vem", "Pode ser o segundo horário", "Valeu"], dur: 171 },
  { de: "+55 11 97412-3388", falas: ["Quanto custa o clareamento?", "Obrigado"], dur: 64 },
  { de: "+55 19 98877-1203", falas: ["Quero falar com uma atendente", "Pode deixar recado: me liguem amanhã"], dur: 96 },
  { de: "+55 19 99111-5544", falas: ["Tem estacionamento aí?", "Obrigada, tchau"], dur: 41 },
  { de: "+55 19 98200-6617", falas: ["Preciso remarcar minha consulta", "Pode ser o primeiro", "Obrigado"], dur: 155 },
  { de: "+55 19 99733-2090", falas: ["Qual o endereço da clínica?", "Valeu"], dur: 47 },
  { de: "+55 19 98455-9012", falas: ["Queria marcar um horário para minha filha", "Pode ser o primeiro horário", "Obrigada"], dur: 188 },
  { de: "+55 11 96320-4471", falas: ["Vocês atendem Bradesco Saúde?", "Ok, tchau"], dur: 52 },
  { de: "+55 19 99240-1187", falas: ["Consigo um desconto no clareamento se fizer as duas arcadas?"], dur: 83 },
  { de: "+55 19 98761-3302", falas: ["Quero fazer uma reclamação, meu dente voltou a doer depois do canal, preciso que a equipe me retorne"], dur: 121 },
];

for (const r of roteiros) {
  const c = await iniciarConversa({ orgId: m.orgId, agenteId: agente.id, canal: "telefone", de: r.de });
  for (const f of r.falas) {
    const resp = await responder(c.conversaId, f);
    if (resp.encerrar) break;
  }
  await encerrarConversa(c.conversaId, { duracaoS: r.dur });
}
console.log(`${roteiros.length} ligações registradas para ${email}`);
process.exit(0);
