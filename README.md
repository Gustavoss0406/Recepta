# Recepta

Agentes de voz com IA que atendem as ligações de empresas. Preço fixo em reais, com tudo incluso.

## Rodar localmente

Pré-requisitos: Node 22+ e Postgres 15+.

```bash
npm install
cp .env.example .env.local      # preencha as chaves que tiver
npm run db:migrate
```

São três processos:

```bash
npm run dev        # site + painel        → http://localhost:3000
npm run voice      # gateway de voz (ws)  → ws://localhost:3100
npm run worker     # cobrança, webhooks, retenção LGPD
```

Testes:

```bash
npm test           # 55 testes: preços, ciclo de cobrança, runtime do agente, suíte, isolamento entre empresas (Postgres em memória)
npm run e2e        # jornada completa no navegador (precisa dos 3 processos rodando)
```

## O que é real e o que é simulado

| Peça | Com chave | Sem chave |
|---|---|---|
| Inteligência do agente (`ANTHROPIC_API_KEY`) | Claude Haiku 5.5 (Sonnet 5.5 no modo avançado), testes com cliente e juiz por IA, análise pós-chamada | **Modo demonstração**: respostas roteirizadas, sinalizado em toda a interface |
| Voz (`TTS_API_KEY`, `TTS_VOICE_MAP`) | Motor premium em streaming; vozes expostas só com nomes do catálogo Recepta | Voz do navegador como provisória (sinalizada) |
| Transcrição (`DEEPGRAM_API_KEY`) | Streaming por WebSocket (padrão) ou `STT_MODO=rest` (por frase, com VAD local) | Teste por voz indisponível; teste em texto funciona |
| Pagamentos (`ASAAS_API_KEY`) | Cobranças Pix, boleto e cartão no Asaas, mais webhook | Simulador de pagamento interno (sinalizado) |
| Telefonia (`TWILIO_*`) | Número próprio, webhook TwiML e Media Streams μ-law | Simulador de ligação no navegador, pelo mesmo pipeline |
| Google Agenda (`GOOGLE_CLIENT_*`) | OAuth, consulta de horários livres e criação de eventos | Agenda Recepta interna |

## Estrutura
- `src/app/(site)`: site institucional (home e preços).
- `src/app/(auth)`: criar conta, entrar, aceitar convite.
- `src/app/painel`: painel do contratante: onboarding em 7 passos, agentes (editor com 10 abas e painel Testar), ligações, testes, análises, números, integrações, uso e cobrança, configurações.
- `src/app/interno`: margem real por cliente (só equipe Recepta, `usuarios.staff = true`).
- `src/app/api`: API pública v1 (chave de API), webhooks do Asaas e do Twilio, OAuth do Google, prévias de voz.
- `src/server/agent`: runtime do agente (prompt, ferramentas, conhecimento por busca em português, pós-chamada).
- `src/server/billing`: assinaturas, medição, teto, linhas simultâneas e pico, faturamento, inadimplência.
- `src/server/testes`: simulações (cliente e juiz por IA), execuções N×, suíte e trava de publicação.
- `src/server/voice`, `src/voice-gateway`: STT, TTS, VAD, tokens de sessão e gateway WebSocket (navegador e Twilio).
- `src/lib/pricing`: custos dos provedores, custo por minuto, planos e margem (fonte única dos números do negócio).
- `src/lib/niches`: modelos e 12 cenários de teste por nicho (clínicas, imobiliárias, restaurantes).
- `docs/engenharia-reversa`: Fase 1 clean-room com REA. `docs/painel`: plano do painel aprovado.

## Licenças de fontes
A Satoshi é usada sob a ITF Free Font License (`public/fonts/satoshi/LICENSE-FFL.txt`). Ela pode ser hospedada no próprio site e app, mas não pode ser oferecida para uso de terceiros. Por isso, o widget que vai nos sites dos clientes usa a fonte do sistema.
