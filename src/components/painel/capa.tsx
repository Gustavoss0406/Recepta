import { fotos } from "@/server/fotos";

/**
 * Faded photo cards floating behind a page header (like the ElevenLabs Flows hero): decorative,
 * hidden on phones and from screen readers.
 */
export async function FundoFotos({ slugs }: { slugs: string[] }) {
  const F = await fotos(slugs);
  const urls = slugs.map((s) => F[s]?.src).filter((x): x is string => Boolean(x));
  if (!urls.length) return null;
  const pos = [
    "right-[2%] top-6 w-40 rotate-[6deg]",
    "right-[17%] -top-3 w-32 -rotate-[5deg]",
    "right-[30%] top-10 w-28 rotate-[3deg]",
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden overflow-hidden [mask-image:linear-gradient(90deg,transparent_25%,#000_70%)] md:block">
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
  const urls = slugs.map((s) => F[s]?.src).filter((x): x is string => Boolean(x)).slice(0, 3);
  if (!urls.length) return null;
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
