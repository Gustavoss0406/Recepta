import Link from "next/link";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="flex h-10 items-center justify-center gap-3 bg-strong px-4 text-[0.8125rem] text-ink">
        <span>
          30 minutos grátis<span className="max-sm:hidden"> para ouvir seu agente atendendo</span>
        </span>
        <Link href="/criar-conta" className="badge !py-1">
          Começar
        </Link>
      </div>
      <SiteHeader />
      <main id="conteudo">{children}</main>
      <SiteFooter />
    </>
  );
}
