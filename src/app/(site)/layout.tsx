import { FaixaAnuncio } from "@/components/painel/inicio-vivo";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FaixaAnuncio id="site-30min" texto="30 minutos grátis" destaque="Sua recepcionista te liga pra você testar" href="/criar-conta" acao="Começar" fotos={["/fotos/clinica.jpg", "/fotos/restaurante.jpg", "/fotos/salao.jpg", "/fotos/imobiliaria.jpg", "/fotos/odontologia.jpg"]} />
      <SiteHeader />
      <main id="conteudo">{children}</main>
      <SiteFooter />
    </>
  );
}
