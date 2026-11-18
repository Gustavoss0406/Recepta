import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { brand } from "@/config/brand";

const COLUMNS = [
  {
    title: "Produto",
    links: [
      ["Recepcionista virtual", "/#produto"],
      ["Vozes brasileiras", "/#vozes"],
      ["Editor de fluxos", "/#produto"],
      ["Analytics", "/#produto"],
      ["Preços", "/precos"],
    ],
  },
  {
    title: "Soluções",
    links: [
      ["Clínicas e consultórios", "/#nichos"],
      ["Imobiliárias", "/#nichos"],
      ["Restaurantes", "/#nichos"],
      ["Oficinas", "/#nichos"],
      ["E-commerce", "/#nichos"],
    ],
  },
  {
    title: "Desenvolvedores",
    links: [
      ["Documentação", "/painel"],
      ["API", "/painel"],
      ["Webhooks", "/painel"],
      ["Status", "/painel"],
    ],
  },
  {
    title: "Empresa",
    links: [
      ["Sobre", "/#empresas"],
      ["Fale com vendas", `mailto:${brand.salesEmail}`],
      ["Parceiros", "/#empresas"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Privacidade (LGPD)", "/privacidade"],
      ["Termos de uso", "/#seguranca"],
      ["Acordo de dados (DPA)", "/#seguranca"],
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-canvas">
      <div className="container-page py-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_repeat(5,1fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 body-sm text-body">{brand.tagline}</p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-medium text-ink">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="body-sm text-body hover:text-ink">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-col gap-3 border-t border-hairline pt-8 body-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {brand.legalName}
          </p>
          <p>Feito no Brasil · Dados tratados conforme a LGPD</p>
        </div>
      </div>
    </footer>
  );
}
