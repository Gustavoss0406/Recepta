import { fotos } from "@/server/fotos";

/** Photos always in the project: fill any slot Unsplash couldn't (no key, offline). */
const RESERVA = ["/fotos/clinica.jpg", "/fotos/restaurante.jpg", "/fotos/salao.jpg", "/fotos/imobiliaria.jpg", "/fotos/odontologia.jpg", "/fotos/oficina.jpg"];
function completar(urls: string[], n: number, semente: string): string[] {
  const out = [...new Set(urls)];
  let i = [...semente].reduce((a, c) => a + c.charCodeAt(0), 0);
  while (out.length < n) {
    const r = RESERVA[i++ % RESERVA.length];
    if (!out.includes(r)) out.push(r);
  }
  return out.slice(0, n);
}

/**
 * Faded photo cards floating behind a page header (like the ElevenLabs Flows hero): decorative,
 * hidden on phones and from screen readers.
 */
export async function FundoFotos({ slugs }: { slugs: string[] }) {
  const F = await fotos(slugs);
  const urls = completar(slugs.map((s) => F[s]?.src).filter((x): x is string => Boolean(x)), 3, slugs.join());
  const pos = [
    "right-[2%] top-6 w-40 rotate-[6deg]",
    "right-[17%] -top-3 w-32 -rotate-[5deg]",
    "right-[30%] top-10 w-28 rotate-[3deg]",
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden [mask-image:linear-gradient(90deg,transparent_25%,#000_70%)] md:block">
      {urls.slice(0, 3).map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={u} src={u} alt="" className={`capa-flutua absolute aspect-[4/3] rounded-[14px] object-cover opacity-[0.16] shadow-[0_8px_24px_rgba(0,0,0,.12)] grayscale-[30%] ${pos[i]}`} style={{ animationDelay: `${i * 1.3}s` }} />
      ))}
    </div>
  );
}

/** Small tilted photo stack for empty states. */
export async function PilhaFotos({ slugs }: { slugs: string[] }) {
  const F = await fotos(slugs);
  const urls = completar(slugs.map((s) => F[s]?.src).filter((x): x is string => Boolean(x)), 3, slugs.join());
  return (
    <div aria-hidden className="relative mx-auto h-20 w-44">
      {urls.map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={u}
          src={u}
          alt=""
          className="absolute top-1/2 left-1/2 h-16 w-20 -translate-y-1/2 rounded-[12px] border-2 border-white object-cover shadow-[0_6px_18px_rgba(0,0,0,.14)]"
          style={{ transform: `translate(calc(-50% + ${(i - (urls.length - 1) / 2) * 46}px), -50%) rotate(${(i - 1) * 8}deg)`, zIndex: i === 1 ? 2 : 1 }}
        />
      ))}
    </div>
  );
}

/** Colored banner at the top of a tab: title, one line and a fan of tilted photos on the right. */
export async function BannerAba({ titulo, texto, slugs, fundo }: { titulo: string; texto: string; slugs: string[]; fundo: string }) {
  const F = await fotos(slugs);
  const urls = completar(slugs.map((s) => F[s]?.src).filter((x): x is string => Boolean(x)), 3, slugs.join());
  return (
    <section className="relative mb-6 flex min-h-[124px] items-center overflow-hidden rounded-[20px] px-6 py-5" style={{ background: fundo }} data-testid="banner-aba">
      <div className="relative z-10 max-w-[62%] sm:max-w-[60%]">
        <h2 className="text-[1.25rem] leading-tight font-semibold tracking-[-0.02em] text-foreground">{titulo}</h2>
        <p className="mt-1 text-sm text-[#3f3f46]">{texto}</p>
      </div>
      <div aria-hidden className="absolute top-1/2 right-4 h-24 w-[40%] max-w-[260px] -translate-y-1/2">
        {urls.map((u, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={u}
            src={u}
            alt=""
            className="absolute top-1/2 h-20 w-24 rounded-[14px] border-2 border-white object-cover shadow-[0_8px_20px_rgba(0,0,0,.15)] sm:h-24 sm:w-32"
            style={{ right: `${i * 26}%`, transform: `translateY(-50%) rotate(${(1 - i) * 7}deg)`, zIndex: 3 - i }}
          />
        ))}
      </div>
    </section>
  );
}
