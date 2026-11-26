import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  CalendarCheck,
  FileCheck,
  FlaskConical,
  GitBranch,
  Lock,
  MessageCircle,
  PhoneForwarded,
  ShieldCheck,
} from "lucide-react";
import { VoiceCarousel } from "@/components/site/voice-carousel";
import { LiveCallDemo } from "@/components/site/live-call-demo";
import { LineCompare } from "@/components/charts/line-compare";
import { CodeBlock } from "@/components/site/code-block";
import { Faq } from "@/components/site/faq";
import { Orb } from "@/components/ui/orb";
import { BannerRotativo } from "@/components/painel/inicio-vivo";
import { PLANS } from "@/lib/pricing/plans";
import { CONECTORES } from "@/lib/integracoes/catalogo";
import { formatBRLRound, formatInt } from "@/lib/format";

/** Photos: Pexels (free license, pexels.com/license). Each card shows what the receptionist did on a real call. */
const NICHES = [
  { foto: "/fotos/clinica.jpg", label: "Clínicas e consultórios", fala: "Consulta marcada para quinta, 9h30", alt: "Recepcionista sorrindo atrás do balcão de uma clínica" },
  { foto: "/fotos/odontologia.jpg", label: "Odontologia", fala: "Confirmou o convênio e a avaliação", alt: "Dentista conversando com paciente no consultório" },
  { foto: "/fotos/restaurante.jpg", label: "Restaurantes e cafés", fala: "Mesa para quatro às 20h, reservada", alt: "Atendente de café falando ao telefone com um tablet na mão" },
  { foto: "/fotos/salao.jpg", label: "Salões e estética", fala: "Corte e escova sábado às 10h", alt: "Cabeleireira arrumando a bancada do salão" },
  { foto: "/fotos/imobiliaria.jpg", label: "Imobiliárias", fala: "Visita ao apartamento passada ao corretor", alt: "Corretor de imóveis falando ao celular com uma prancheta" },
];

const RESOLUTION = {
  labels: ["10 nov", "11 nov", "12 nov", "13 nov", "14 nov", "15 nov", "16 nov", "17 nov"],
  v2: [78.2, 80.4, 79.1, 82.6, 84.0, 83.1, 85.7, 86.9],
  v1: [66.0, 64.8, 67.3, 65.1, 63.9, 66.4, 64.2, 65.5],
};

const INTEGRATIONS = ["google", "whatsapp", "twilio", "hubspot", "pipedrive", "rd_station", "kommo", "zendesk", "salesforce", "outlook", "make", "n8n"]
  .map((id) => CONECTORES.find((c) => c.id === id)!)
  .filter(Boolean);

const API_EXAMPLE = `import { Recepta } from "@recepta/sdk";

const recepta = new Recepta({ apiKey: process.env.RECEPTA_API_KEY });

const agente = await recepta.agentes.criar({
  nome: "Recepção Clínica Sorriso",
  fonteUrl: "https://clinicasorriso.com.br",
  voz: "lia",
  ferramentas: ["google_agenda", "whatsapp_confirmacao"],
});

await recepta.numeros.vincular(agente.id, { desvioDe: "+55 11 3333-4444" });`;

const FAQ = [
  {
    q: "Preciso trocar o número de telefone da minha empresa?",
    a: "Não. Você ativa o desvio de chamadas na sua operadora para o número que a Recepta fornece. Seus clientes continuam ligando para o mesmo número de sempre.",
  },
  {
    q: "A recepcionista soa natural?",
    a: "As vozes do nosso catálogo foram gravadas por dubladores brasileiros, com sotaques regionais, e rodam no motor de voz mais bem avaliado do mercado. A conversa tem pausas, interrupções e entonação naturais.",
  },
  {
    q: "O que está incluído no preço?",
    a: "Tudo: número local, minutos de ligação, voz, transcrição, relatórios para a equipe e o resumo enviado por WhatsApp. Sem conta em dólar e sem cobrança separada de telefonia.",
  },
  {
    q: "E quando ela não souber responder?",
    a: "Ela transfere a ligação para o número que você definir. Quando não tem certeza de como resolver, ou fora do horário, avisa o cliente que alguém vai retornar e passa o caso pronto para sua equipe, com um relatório do que o cliente quer.",
  },
  {
    q: "Como ficam a LGPD e as gravações?",
    a: "A recepcionista se apresenta como atendimento virtual e avisa que a ligação é gravada. Você define por quanto tempo guardar áudios e transcrições, e dados como CPF podem ser mascarados automaticamente.",
  },
  {
    q: "Quanto tempo leva para colocar no ar?",
    a: "Cerca de cinco minutos: cole o endereço do seu site, escolha uma voz, revise as respostas e ative o desvio de chamadas.",
  },
];

export default function Home() {
  const preview = PLANS.filter((p) => ["start", "pro", "business"].includes(p.id));

  return (
    <div className="grid-frame">
      {/* Hero */}
      <section className="container-page pt-16 pb-10 sm:pt-24">
        <div className="grid items-end gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <h1 className="display-hero max-w-xl text-ink">Sua empresa atende toda ligação. Sempre.</h1>
            <div className="mt-8 flex flex-wrap gap-2">
              <Link href="/criar-conta" className="btn btn-primary">
                Criar minha recepcionista
              </Link>
              <Link href="/precos" className="btn btn-secondary">
                Ver preços
              </Link>
            </div>
          </div>
          <p className="lead max-w-md text-ink lg:justify-self-end">
            Uma recepcionista que atende toda ligação, agenda e tira dúvidas 24 horas por dia e, na dúvida, passa o caso pronto para sua equipe. Em português natural, por um preço fixo em reais.
          </p>
        </div>
        <div className="mt-12">
          <VoiceCarousel />
        </div>
      </section>

      {/* Niches: photo cards */}
      <section id="nichos" className="rule-t">
        <div className="container-page flex flex-wrap items-end justify-between gap-4 pt-20 pb-8">
          <div>
            <p className="eyebrow">Para quem vive do telefone</p>
            <h2 className="mt-3 display-section max-w-xl">Uma recepcionista pronta para o seu tipo de negócio</h2>
          </div>
          <Link href="/criar-conta" className="btn btn-sm btn-secondary">
            Ver modelos prontos
          </Link>
        </div>
        <ul className="container-page flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto pb-20 [scrollbar-width:none] lg:grid lg:grid-cols-5 lg:overflow-visible">
          {NICHES.map((n) => (
            <li key={n.label} className="group relative aspect-[4/5] w-[72%] shrink-0 snap-start overflow-hidden rounded-[20px] bg-strong sm:w-[42%] lg:w-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={n.foto} alt={n.alt} loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden />
              <div className="absolute inset-x-3 bottom-3 space-y-2">
                <p className="px-1 text-[0.9375rem] font-medium text-white">{n.label}</p>
                <div className="flex items-start gap-2 rounded-[14px] bg-white/90 p-2 shadow-[0_1px_2px_rgba(0,0,0,0.08)] backdrop-blur-md">
                  <Orb tom="mint" tamanho={20} className="mt-px" />
                  <span className="text-[0.75rem] leading-snug text-ink">{n.fala}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-page pb-20">
        <BannerRotativo
          slides={[
            { linha1: "Atende toda ligação,", linha2: "24 horas por dia", fotos: ["/fotos/clinica.jpg", "/fotos/restaurante.jpg", "/fotos/salao.jpg", "/fotos/imobiliaria.jpg"], href: "/criar-conta" },
            { linha1: "Do alô ao", linha2: "horário marcado na agenda", fotos: ["/fotos/odontologia.jpg", "/fotos/salao.jpg", "/fotos/clinica.jpg", "/fotos/restaurante.jpg"], href: "/criar-conta" },
            { linha1: "Na dúvida, passa o caso", linha2: "pronto pra sua equipe", fotos: ["/fotos/imobiliaria.jpg", "/fotos/odontologia.jpg", "/fotos/restaurante.jpg", "/fotos/salao.jpg"], href: "/precos" },
          ]}
        />
      </section>

      {/* Agents bento */}
      <section id="produto" className="container-page py-24">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <div>
            <p className="eyebrow">Recepcionista virtual</p>
            <h2 className="mt-3 display-section max-w-lg">Atende, resolve e, na dúvida, passa o caso para a sua equipe</h2>
            <Link href="/criar-conta" className="btn btn-sm btn-primary mt-6">
              Saiba mais
            </Link>
          </div>
          <p className="lead max-w-md text-ink lg:justify-self-end">
            Configure a voz, as respostas e as integrações num só lugar. Acompanhe cada ligação com transcrição, resumo e
            resultado.
          </p>
        </div>

        <div className="mt-12 grid gap-2 lg:grid-cols-2">
          <article className="relative overflow-hidden rounded-[16px] bg-dark p-1">
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-70"
              style={{
                background:
                  "radial-gradient(120% 80% at 20% 0%, #3b4a63 0%, transparent 60%), radial-gradient(80% 80% at 100% 100%, #2a3b3a 0%, transparent 60%)",
              }}
            />
            <div className="relative">
              <LiveCallDemo tone="dark" />
              <div className="px-5 pt-2 pb-5">
                <p className="text-sm text-white/60">Atendimento por telefone e WhatsApp</p>
                <p className="mt-1 text-[0.9375rem] text-white">
                  Ela ouve, entende e age durante a ligação: consulta a agenda, marca e confirma. O que não souber, passa para a equipe com um relatório.
                </p>
              </div>
            </div>
          </article>
          <article className="panel flex flex-col justify-between gap-6 p-5">
            <LineCompare
              title="Taxa de resolução"
              headline="86,9% na versão 2"
              labels={RESOLUTION.labels}
              series={[
                { key: "v2", label: "V2", color: "var(--color-data-1)", values: RESOLUTION.v2 },
                { key: "v1", label: "V1", color: "var(--color-data-2)", values: RESOLUTION.v1 },
              ]}
            />
            <div>
              <p className="text-sm text-muted-foreground">Analytics</p>
              <p className="mt-1 text-[0.9375rem] text-ink">
                Compare versões da recepcionista e veja quantas ligações viraram agendamento, venda ou resolução.
              </p>
            </div>
          </article>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          {[
            {
              icon: FlaskConical,
              title: "Testes",
              text: "Simule conversas difíceis antes de publicar e confirme que ela responde como você espera.",
            },
            {
              icon: ShieldCheck,
              title: "Regras de segurança",
              text: "Defina o que ela pode e não pode dizer, quando transferir e quando passar o caso para a equipe.",
            },
            {
              icon: GitBranch,
              title: "Fluxos",
              text: "Monte roteiros de agendamento, triagem e segunda via, e conecte aos seus sistemas.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <article key={title} className="panel p-5">
              <span className="grid size-9 place-items-center rounded-[10px] bg-white shadow-[var(--shadow-pill)]">
                <Icon size={17} strokeWidth={1.6} />
              </span>
              <h3 className="mt-10 text-sm text-muted-foreground">{title}</h3>
              <p className="mt-1 text-[0.9375rem] text-ink">{text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="rule-t">
        <div className="container-page py-24">
          <h2 className="display-section max-w-xl">No ar em cinco minutos, sem trocar de número</h2>
          <ol className="mt-12 grid border-y border-hairline md:grid-cols-3">
            {[
              {
                n: "01",
                title: "Cole o endereço do seu site",
                text: "Lemos suas páginas e montamos a base de conhecimento: serviços, preços, horários e endereço.",
                art: <Diagram kind="site" />,
              },
              {
                n: "02",
                title: "Escolha a voz e revise",
                text: "Ouça as vozes, ajuste a saudação e teste uma ligação pelo navegador.",
                art: <Diagram kind="voice" />,
              },
              {
                n: "03",
                title: "Ative o desvio de chamadas",
                text: "Na sua operadora, desvie para o número da Recepta. Pronto: nenhuma ligação perdida.",
                art: <Diagram kind="forward" />,
              },
            ].map((s, i) => (
              <li key={s.n} className={`p-6 sm:p-8 ${i < 2 ? "md:border-r border-hairline" : ""} ${i ? "max-md:border-t" : ""}`}>
                <div className="flex h-36 items-center justify-center">{s.art}</div>
                <p className="mt-6 font-mono text-xs text-muted-foreground">{s.n}</p>
                <h3 className="mt-2 text-[0.9375rem] text-ink">{s.title}</h3>
                <p className="mt-2 body-sm text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Voices */}
      <section id="vozes" className="rule-t">
        <div className="container-page grid gap-12 py-24 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Vozes</p>
            <h2 className="mt-3 display-section max-w-md">Vozes brasileiras que ninguém mais tem</h2>
            <p className="mt-6 lead max-w-md text-body">
              Vozes nativas do português do Brasil, com entonação de quem atende de verdade e leitura certa de CPF,
              CEP, datas e valores. Escolha a que combina com a sua marca e ouça antes de publicar.
            </p>
            <Link href="/" className="btn btn-sm btn-secondary mt-8">
              Ouvir as vozes
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(
              [
                ["Lia", "Expressiva", "mint"],
                ["Rafael", "Cordial", "sky"],
                ["Bia", "Calma", "peach"],
                ["Caio", "Amigável", "rose"],
                ["Helena", "Formal", "lavender"],
                ["Tomás", "Executivo", "ink"],
              ] as const
            ).map(([name, accent, tone]) => (
              <li key={name} className="panel flex flex-col items-center gap-3 px-3 py-6">
                <Orb tom={tone} tamanho={72} />
                <div className="text-center">
                  <p className="text-sm text-ink">{name}</p>
                  <p className="text-xs text-muted-foreground">{accent}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Integrations */}
      <section className="rule-t">
        <div className="container-page grid gap-10 py-24 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="display-section max-w-sm">Conectado às ferramentas que você já usa</h2>
            <Link href="/criar-conta" className="btn btn-sm btn-secondary mt-6">
              Ver integrações
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {INTEGRATIONS.map((c) => (
              <li key={c.id} className="panel flex items-center gap-3 px-3 py-3 text-sm text-ink">
                <span className="grid size-8 shrink-0 place-items-center rounded-[9px] border border-hairline bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.logo} alt="" width={18} height={18} className="object-contain" />
                </span>
                <span className="truncate">{c.nome}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* API */}
      <section className="rule-t">
        <div className="container-page grid gap-10 py-24 lg:grid-cols-2">
          <div>
            <p className="eyebrow">API</p>
            <h2 className="mt-3 display-section max-w-md">Para quem quer integrar tudo</h2>
            <p className="mt-6 lead max-w-md text-body">
              Crie agentes, vincule números e receba o resultado de cada ligação por webhook, com resumo, dados
              extraídos e o custo da chamada.
            </p>
            <dl className="mt-8 grid max-w-md grid-cols-2 gap-6">
              <div>
                <dt className="text-sm text-ink">API REST e WebSocket</dt>
                <dd className="text-sm text-muted-foreground">Conversa em tempo real</dd>
              </div>
              <div>
                <dt className="text-sm text-ink">Webhooks assinados</dt>
                <dd className="text-sm text-muted-foreground">call.ended com resumo</dd>
              </div>
            </dl>
          </div>
          <CodeBlock code={API_EXAMPLE} label="exemplo de código" />
        </div>
      </section>

      {/* Pricing preview */}
      <section className="rule-t">
        <div className="container-page py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="display-section max-w-lg">Preço fixo em reais, com tudo incluso</h2>
            <Link href="/precos" className="btn btn-sm btn-secondary">
              Comparar planos
            </Link>
          </div>
          <div className="mt-12 grid gap-2 md:grid-cols-3">
            {preview.map((p) => (
              <article
                key={p.id}
                className={`flex flex-col rounded-[16px] p-6 ${p.featured ? "bg-dark text-white" : "panel"}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-[0.9375rem]">{p.name}</h3>
                  {p.featured && <span className="badge !bg-white/10 !text-white !shadow-none">Mais escolhido</span>}
                </div>
                <p className="mt-6">
                  <span className="display-section">{formatBRLRound(p.priceBrl ?? 0)}</span>
                  <span className={p.featured ? "text-white/60" : "text-muted-foreground"}> /mês</span>
                </p>
                <p className={`mt-2 text-sm ${p.featured ? "text-white/70" : "text-muted-foreground"}`}>
                  {formatInt(p.includedMinutes)} minutos inclusos · {p.concurrency} chamadas simultâneas
                </p>
                <Link href="/criar-conta" className={`btn btn-sm mt-8 ${p.featured ? "btn-on-dark" : "btn-primary"}`}>
                  Começar com {p.name}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section id="seguranca" className="rule-t">
        <div className="container-page grid gap-10 py-24 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="display-section max-w-sm">Seus dados tratados do jeito certo</h2>
            <Link href="/privacidade" className="btn btn-sm btn-secondary mt-6">
              Política de privacidade
            </Link>
          </div>
          <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {[
              [Lock, "LGPD desde o primeiro dia"],
              [MessageCircle, "Aviso de atendimento virtual e de gravação"],
              [FileCheck, "Retenção de áudio configurável"],
              [ShieldCheck, "CPF e cartões mascarados nas transcrições"],
              [Building2, "Acordo de tratamento de dados (DPA)"],
              [PhoneForwarded, "Transferência para humano a qualquer momento"],
            ].map(([Icon, label]) => {
              const I = Icon as typeof Lock;
              return (
                <li key={label as string} className="flex items-center gap-3 text-sm text-ink">
                  <I size={18} strokeWidth={1.5} className="text-body" />
                  {label as string}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="empresas" className="rule-t">
        <div className="container-page grid gap-10 py-24 lg:grid-cols-[1fr_2fr]">
          <h2 className="display-section">Perguntas frequentes</h2>
          <Faq items={FAQ} />
        </div>
      </section>

      {/* Final CTA */}
      <section className="rule-t">
        <div className="container-page flex flex-col items-center py-28 text-center">
          <Orb tom="mint" tamanho={96} className="mb-10">
            <CalendarCheck size={22} className="text-ink/80" />
          </Orb>
          <h2 className="display-section max-w-xl">Pare de perder clientes porque ninguém atendeu</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <Link href="/criar-conta" className="btn btn-primary">
              Criar minha recepcionista grátis
            </Link>
            <Link href="/precos" className="btn btn-secondary">
              Falar com vendas <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Thin line-art diagrams (own artwork) for the 3-step section. */
function Diagram({ kind }: { kind: "site" | "voice" | "forward" }) {
  const stroke = "var(--color-ink)";
  if (kind === "site")
    return (
      <svg width="180" height="110" viewBox="0 0 180 110" fill="none" aria-hidden="true">
        <rect x="20" y="10" width="140" height="90" rx="8" stroke="var(--color-hairline-strong)" />
        <line x1="20" y1="26" x2="160" y2="26" stroke="var(--color-hairline-strong)" />
        {[40, 54, 68, 82].map((y, i) => (
          <line key={y} x1="34" y1={y} x2={i % 2 ? 120 : 146} y2={y} stroke={i === 1 ? stroke : "var(--color-hairline-strong)"} strokeWidth={i === 1 ? 1.5 : 1} />
        ))}
        <circle cx="146" cy="54" r="4" fill={stroke} />
      </svg>
    );
  if (kind === "voice")
    return (
      <svg width="180" height="110" viewBox="0 0 180 110" fill="none" aria-hidden="true">
        {[20, 34, 48].map((r) => (
          <circle key={r} cx="90" cy="55" r={r} stroke={r === 34 ? stroke : "var(--color-hairline-strong)"} />
        ))}
        <circle cx="56" cy="55" r="3.5" fill={stroke} />
        <circle cx="124" cy="55" r="3.5" fill={stroke} />
      </svg>
    );
  return (
    <svg width="180" height="110" viewBox="0 0 180 110" fill="none" aria-hidden="true">
      <circle cx="30" cy="55" r="4" stroke={stroke} />
      <line x1="34" y1="55" x2="96" y2="55" stroke={stroke} />
      <circle cx="100" cy="55" r="4" fill={stroke} />
      <line x1="104" y1="55" x2="146" y2="20" stroke="var(--color-hairline-strong)" />
      <line x1="104" y1="55" x2="150" y2="55" stroke={stroke} />
      <line x1="104" y1="55" x2="146" y2="90" stroke="var(--color-hairline-strong)" />
      <circle cx="150" cy="20" r="4" stroke="var(--color-hairline-strong)" />
      <circle cx="154" cy="55" r="4" stroke={stroke} />
      <circle cx="150" cy="90" r="4" stroke="var(--color-hairline-strong)" />
    </svg>
  );
}
