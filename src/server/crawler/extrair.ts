import { parse, type HTMLElement } from "node-html-parser";

const BLOCOS = new Set(["p", "div", "section", "article", "li", "h1", "h2", "h3", "h4", "h5", "h6", "br", "tr", "td", "th", "dd", "dt", "header", "footer", "address", "main", "aside", "ul", "ol", "table", "blockquote"]);

export interface Pagina {
  url: string;
  titulo: string;
  descricao: string;
  texto: string;
  links: string[];
}

/** HTML → readable text (block-aware) + same-origin links. */
export function extrairPagina(html: string, url: string): Pagina {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false, pre: true } });
  root.querySelectorAll("script, style, noscript, svg, iframe, form, [aria-hidden=true]").forEach((n) => n.remove());
  const titulo = root.querySelector("title")?.text.trim() ?? "";
  const descricao = root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "";

  const partes: string[] = [];
  const andar = (n: HTMLElement) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) partes.push(c.rawText.replace(/\s+/g, " "));
      else if (c.nodeType === 1) {
        const el = c as HTMLElement;
        const bloco = BLOCOS.has(el.rawTagName?.toLowerCase());
        if (bloco) partes.push("\n");
        andar(el);
        if (bloco) partes.push("\n");
      }
    }
  };
  andar(root.querySelector("body") ?? root);
  const texto = decodificar(partes.join(""))
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1)
    .filter((l, i, arr) => arr.indexOf(l) === i)
    .join("\n");

  const base = new URL(url);
  const links = root
    .querySelectorAll("a[href]")
    .map((a) => {
      try {
        const u = new URL(a.getAttribute("href")!, base);
        u.hash = "";
        return u;
      } catch {
        return null;
      }
    })
    .filter((u): u is URL => !!u && u.origin === base.origin && !/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|mp3|docx?|xlsx?)$/i.test(u.pathname))
    .map((u) => u.toString());

  return { url, titulo, descricao, texto, links: [...new Set(links)] };
}

function decodificar(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export interface Fatos {
  telefones: string[];
  emails: string[];
  enderecos: string[];
  horarios: string[];
  precos: string[];
  pagamentos: string[];
}

const RE_TEL = /(?:\+?55\s?)?\(?\b([1-9]\d)\)?[\s.-]?(9?\d{4})[\s.-]?(\d{4})\b/g;
const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const RE_END = /\b(rua|r\.|av\.|avenida|alameda|travessa|rodovia|praça|estrada)\b.{5,120}|\b\d{5}-\d{3}\b/i;
const RE_HORA = /\b(segunda|seg\.?|terça|ter\.?|quarta|quinta|sexta|s[áa]bado|s[áa]b\.?|domingo|dom\.?|feriados?)\b.*\b\d{1,2}\s?(h|:\d{2})/i;
const RE_PRECO = /R\$\s?\d/;
const PAGAMENTOS = ["Pix", "Dinheiro", "Cartão de crédito", "Cartão de débito", "Boleto", "Vale-refeição"];

/** Heuristic facts used when no LLM is configured (and as hints when it is). */
export function extrairFatos(texto: string): Fatos {
  const linhas = texto.split("\n");
  const telefones = [...texto.matchAll(RE_TEL)].map((m) => `(${m[1]}) ${m[2]}-${m[3]}`);
  const t = texto.toLowerCase();
  return {
    telefones: [...new Set(telefones)].slice(0, 5),
    emails: [...new Set(texto.match(RE_EMAIL) ?? [])].slice(0, 5),
    enderecos: [...new Set(linhas.filter((l) => RE_END.test(l) && l.length < 200))].slice(0, 3),
    horarios: [...new Set(linhas.filter((l) => RE_HORA.test(l) && l.length < 160))].slice(0, 7),
    precos: [...new Set(linhas.filter((l) => RE_PRECO.test(l) && l.length < 160))].slice(0, 12),
    pagamentos: PAGAMENTOS.filter((p) => t.includes(p.toLowerCase().replace("cartão de ", "")) || t.includes(p.toLowerCase())),
  };
}

/** ~700-char chunks on line boundaries, for full-text retrieval. */
export function fatiar(texto: string, alvo = 700): string[] {
  const out: string[] = [];
  let atual = "";
  for (const l of texto.split("\n")) {
    if ((atual + "\n" + l).length > alvo && atual) {
      out.push(atual.trim());
      atual = "";
    }
    atual += (atual ? "\n" : "") + l;
  }
  if (atual.trim()) out.push(atual.trim());
  return out;
}
