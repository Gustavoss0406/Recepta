"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";

const NAV = [
  { href: "/#produto", label: "Produto" },
  { href: "/#vozes", label: "Vozes" },
  { href: "/#nichos", label: "Soluções" },
  { href: "/precos", label: "Preços" },
  { href: "/#empresas", label: "Empresas" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 bg-canvas/85 backdrop-blur-md transition-[border-color] ${
        scrolled ? "border-b border-hairline" : "border-b border-transparent"
      }`}
    >
      <div className="container-page flex h-16 items-center justify-between">
        <div className="flex items-center gap-10">
          <Link href="/" aria-label="Página inicial" className="text-ink">
            <Logo />
          </Link>
          <nav aria-label="Principal" className="hidden items-center gap-7 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-sm text-ink/80 hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/entrar" className="btn btn-sm btn-secondary">
            Entrar
          </Link>
          <Link href="/criar-conta" className="btn btn-sm btn-primary">
            Teste grátis
          </Link>
        </div>
        <button
          type="button"
          className="-mr-2 grid size-10 place-items-center rounded-full text-ink md:hidden"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto bg-canvas md:hidden">
          <nav aria-label="Menu móvel" className="container-page flex flex-col py-4">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="border-b border-hairline py-4 display-sm text-ink"
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-8 flex flex-col gap-3">
              <Link href="/criar-conta" className="btn btn-primary" onClick={() => setOpen(false)}>
                Teste grátis
              </Link>
              <Link href="/entrar" className="btn btn-secondary" onClick={() => setOpen(false)}>
                Entrar
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
