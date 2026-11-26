import { describe, expect, it } from "vitest";
import { lerSite, textoDoPerfil, usuarioInstagram } from "./rastreio";

const HTML = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"RealEstateAgent","name":"Lar Imóveis","description":"Imobiliária em Campinas desde 1998","telephone":"(19) 3232-1000","priceRange":"$$","address":{"streetAddress":"Rua Coronel Quirino, 500","addressLocality":"Campinas","addressRegion":"SP"},"openingHours":["Mo-Fr 09:00-18:00","Sa 09:00-13:00"],"aggregateRating":{"ratingValue":"4.8","reviewCount":"212"},"sameAs":["https://www.facebook.com/larimoveis"]}</script></head>
<body><a href="https://www.instagram.com/lar.imoveis/">Insta</a><a href="https://wa.me/5519998765432">WhatsApp</a><a href="mailto:contato@larimoveis.com.br">e-mail</a><p>Ligue (19) 3232-1000</p></body></html>`;

describe("rastreio da empresa", () => {
  it("lê contatos, redes e dados estruturados do site", () => {
    const p = lerSite(HTML, "https://larimoveis.com.br");
    expect(p.nome).toBe("Lar Imóveis");
    expect(p.endereco).toBe("Rua Coronel Quirino, 500, Campinas, SP");
    expect(p.telefones).toContain("1932321000");
    expect(p.whatsapp).toEqual(["5519998765432"]);
    expect(p.emails).toEqual(["contato@larimoveis.com.br"]);
    expect(p.redes?.instagram).toContain("lar.imoveis");
    expect(p.redes?.facebook).toContain("larimoveis");
    expect(p.avaliacao).toEqual({ nota: 4.8, total: 212, fonte: "site" });
    expect(p.horarios).toEqual(["Mo-Fr 09:00-18:00", "Sa 09:00-13:00"]);
  });

  it.each([
    ["@lar.imoveis", "lar.imoveis"],
    ["instagram.com/lar.imoveis/", "lar.imoveis"],
    ["https://www.instagram.com/lar.imoveis?igsh=abc", "lar.imoveis"],
    ["lar.imoveis", "lar.imoveis"],
    ["https://instagram.com/p/XYZ", null],
  ])("instagram %s", (e, u) => expect(usuarioInstagram(e)).toBe(u));

  it("monta um texto pesquisável", () => {
    const t = textoDoPerfil({ ...(lerSite(HTML, "x") as object), telefones: ["1932321000"], emails: [], whatsapp: [], redes: {}, web: [{ titulo: "Lar Imóveis no Reclame Aqui", trecho: "Nota 8,9", url: "u" }], fontes: [] });
    expect(t).toMatch(/Endereço: Rua Coronel Quirino/);
    expect(t).toMatch(/4.8 de 5/);
    expect(t).toMatch(/Reclame Aqui/);
  });
});
