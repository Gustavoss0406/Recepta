const RESULTADOS: Record<string, { texto: string; cor: string }> = {
  resolvido: { texto: "Resolvido", cor: "bg-[#e9f7ef] text-[#147a3d]" },
  repassado: { texto: "Passado à equipe", cor: "bg-[#eaf1fe] text-[#1d4fd7]" },
  transferido: { texto: "Transferido", cor: "bg-[#f1ecfd] text-[#5b3cc4]" },
  recado: { texto: "Passado à equipe", cor: "bg-[#eaf1fe] text-[#1d4fd7]" },
  nao_resolvido: { texto: "Não resolvido", cor: "bg-[#fdecec] text-[#a4161a]" },
};

export function BadgeResultado({ resultado }: { resultado: string | null }) {
  if (!resultado) return <span className="rounded-[6px] bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">Em andamento</span>;
  const r = RESULTADOS[resultado] ?? { texto: resultado, cor: "bg-strong text-body" };
  return <span className={`shrink-0 rounded-[6px] px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${r.cor}`}>{r.texto}</span>;
}

export const CANAIS: Record<string, string> = {
  telefone: "Telefone",
  whatsapp: "WhatsApp",
  widget: "Site",
  simulador: "Simulador",
  teste_texto: "Teste (texto)",
  teste_voz: "Teste (voz)",
  simulacao: "Simulação",
};
