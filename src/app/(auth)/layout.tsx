import { fotos } from "@/server/fotos";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Orb } from "@/components/ui/orb";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const F = await fotos(["clinica", "restaurante", "salao", "imobiliaria", "oficina", "academia", "petshop", "veterinaria", "escola"]);
  const base = ["/fotos/clinica.jpg", "/fotos/restaurante.jpg", "/fotos/salao.jpg", "/fotos/imobiliaria.jpg", "/fotos/oficina.jpg", "/fotos/odontologia.jpg"];
  const achadas = Object.values(F).map((f) => f?.src).filter((x): x is string => Boolean(x));
  const mosaico = Array.from({ length: 9 }, (_, i) => (achadas.length ? achadas : base)[i % (achadas.length || base.length)]);
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
      <aside className="relative hidden overflow-hidden bg-[#0a0a0a] lg:block" aria-hidden="true">
        <div className="absolute inset-0 grid grid-cols-3 gap-3 p-3 opacity-90">
          {mosaico.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u + i} src={u} alt="" className={`size-full rounded-[18px] object-cover ${i % 3 === 1 ? "translate-y-10" : ""}`} />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <Orb tom="mint" tamanho={96} className="absolute top-10 right-10" />
        <div className="absolute right-10 bottom-10 left-10 rounded-[18px] bg-white/85 p-5 text-[0.9375rem] text-ink shadow-[0_10px_30px_rgba(0,0,0,.25)] backdrop-blur-md">
          “Desde que a recepcionista começou a atender, não perdemos mais nenhuma ligação fora do horário.”
          <span className="mt-2 block text-sm text-muted-foreground">Exemplo ilustrativo</span>
        </div>
      </aside>
    </div>
  );
}
