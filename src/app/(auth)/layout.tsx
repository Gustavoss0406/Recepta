import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Orb } from "@/components/ui/orb";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Link href="/" aria-label="Recepta, página inicial" className="self-start text-ink">
          <Logo />
        </Link>
        <main className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
      <aside className="relative hidden overflow-hidden bg-strong lg:block" aria-hidden="true">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            <Orb tom="mint" tamanho={280} />
            <Orb tom="lavender" tamanho={120} className="absolute -top-10 -right-24" />
            <Orb tom="peach" tamanho={84} className="absolute -bottom-6 -left-20" />
          </div>
        </div>
        <p className="absolute right-10 bottom-10 left-10 text-[0.9375rem] text-body">
          “Desde que o agente começou a atender, não perdemos mais nenhuma ligação fora do horário.”
          <span className="mt-2 block text-sm text-muted-foreground">Exemplo ilustrativo</span>
        </p>
      </aside>
    </div>
  );
}
