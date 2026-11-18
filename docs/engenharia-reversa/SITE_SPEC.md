# SITE_SPEC: estrutura das páginas (clean-room)

Evidência: outlines de acessibilidade do REA (`evidencias/*-outline.txt`) e capturas de referência. Cada linha descreve **função e comportamento**. O texto é sempre reescrito por nós.

## 1. Home (`/pt`), 10.918px de altura no desktop

| # | Seção (FATO) | Interação (FATO) | Nossa versão |
|---|---|---|---|
| 0 | Faixa promocional fina no topo, com CTA pill | link | Faixa "30 minutos grátis" |
| 1 | Nav de 64px: logo, menus Produtos, Soluções, Clientes, Recursos, Empresas e Preços; à direita "Entrar" (pill branco) e "Criar conta" (pill preto) | menus com dropdown | Produto, Vozes, Soluções, Preços, Empresas |
| 2 | Hero: H1 serif 48px à esquerda; parágrafo de 3 linhas à direita; 2 CTAs | — | igual (texto próprio) |
| 3 | **Painel de produto**: abas no topo (3 produtos), **carrossel de esferas de voz** com play, nome da voz e descrição, setas, e pills embaixo (Gerador de voz, TTS, Música, STT, Clonar, Dublagem) com CTA | play da prévia, troca de aba, carrossel | Abas **Telefone / WhatsApp / Site**; carrossel com as nossas 6 vozes; pills por nicho |
| 4 | "Confiado por…": grade de 3×6 logos dentro da grade de linhas | links para cases | **Nichos atendidos** (sem logos de terceiros) |
| 5 | "Duas plataformas…": 2 colunas com screenshot | — | "Telefone e WhatsApp, um só agente" |
| 6 | Bloco Creative (fora do nosso escopo) | — | — |
| 7 | **Bloco Agentes**: eyebrow, H2, parágrafo, CTA; bento com (a) card escuro com chat de reembolso e (b) card com gráfico "Taxa de resolução 83,4%, V1 × V2"; 3 cards (Testes, Regras de segurança, Fluxos); faixa de case | hover no gráfico | Bento com ligação real de clínica, gráfico de resolução e 3 cards |
| 8 | Bloco API: lista de modelos e **bloco de código** com botão copiar | copiar | Bloco "API e webhooks" com exemplo nosso |
| 9 | Impacto e cases: abas e mosaico de fotos | abas | (fase 2) |
| 10 | Linha do tempo de modelos (12 eventos, tablist) | abas | Não fazemos (não somos laboratório de modelos) |
| 11 | Segurança: Moderação, Responsabilidade, Proveniência | — | **LGPD, gravação com aviso, retenção** |
| 12 | Novidades (3 posts) | — | (fase 2) |
| 13 | CTA final e rodapé de 5 colunas mais seletor de idioma | — | igual |

## 2. Agentes (`/pt/agents`), 10.561px de altura

| # | Seção (FATO) | Nossa versão |
|---|---|---|
| 1 | Sub-nav de produto (logo do produto à esquerda; Plataforma, Soluções, Documentação, Clientes, Preços) | Sub-nav no painel e na doc |
| 2 | Hero: H1 de 2 linhas, parágrafo à direita, CTAs "Falar com vendas" (preto) e "Criar agente" (branco) | igual |
| 3 | **Carrossel de 4 slides** com foto de pessoa ao telefone; rótulo do caso ("Agendamento de horários · Crie seu próprio agente"); **balões de transcrição palavra por palavra**; botão "Ativar som" | **Hero da home**: card de ligação ao vivo com transcrição animada e ações (agenda, WhatsApp) |
| 4 | Logos de clientes | nichos |
| 5 | 3 colunas com diagrama em traço: experiência, crescimento, eficiência | igual, com diagramas próprios |
| 6 | Vídeo-case com depoimentos em abas | (fase 2, depois de ter clientes reais) |
| 7 | **Bento de 4 células**: editor de fluxo (mockup do painel com sidebar Overview, Agents, Workflows, Branches, Knowledge, Analysis, Tools, Widget, Settings); esfera "Voz / Chat"; teste com guardrail ("Solicitação bloqueada pelo guardrail"); analytics (taxa de resolução, CSAT 4,6, idiomas, taxa de sucesso) | Bento igual em função, com mockups do **nosso** painel |
| 8 | Integrações: lista com ícones (Zapier, Stripe, Shopify, Salesforce, HubSpot, Zendesk, Twilio…) | Integrações BR: Google Agenda, WhatsApp, RD Station, Pipedrive, HubSpot, Bling, iClinic |
| 9 | **Demos por área**: tabs (Suporte, Vendas, Operações, Marketing, Talentos) e painel com esfera e play, mais sub-agentes (Pedidos, Triagem, Recepção, FAQ) e "Clonar agente" | Demos por nicho, com "Usar este modelo" |
| 10 | Conformidade: SOC 2, ISO, residência de dados, ZRM, HIPAA… | LGPD, retenção, DPA, dados no Brasil |
| 11 | 3 colunas de início: Criar conta (lista de bullets) / Empresas / APIs e SDKs (com código) | igual |
| 12 | Cases, FAQ com 6 perguntas em acordeão, rodapé | FAQ próprio |
| 13 | **Botão flutuante "Experimente um agente"** (widget com esfera) | Botão "Ligue para a demo" e widget |

## 3. Preços de agentes (`/pt/pricing/agents`), 6.492px de altura

FATO (`evidencias/pricing-text.txt`):
- **Seletor de produto** (3 tabs) e **Mensal / Anual**.
- **7 cards**: Grátis 15 min / 4 simultâneas; Starter US$ 6 / 75 min / 6; Creator US$ 22 / 275 / 10 ("Popular"); Pro US$ 99 / 1.238 / 20; Scale US$ 299 / 3.738 / 30; Business US$ 990 / 12.375 / 40; Enterprise sob consulta. Os cards usam "Tudo no X, mais…".
- **Calculadora em 2 passos**: (1) assinatura ou pague conforme o uso, mensal ou anual; (2) slider de minutos/mês (0 a 19k+) e **seletor de modelo LLM com preço por minuto** (ex.: Gemini 2.5 Flash a **US$ 0,0029/min**). O resultado mostra o plano recomendado, o preço, os minutos inclusos, o excedente (US$ 0,08/min) e o custo de LLM estimado.
- **Tabela detalhada**: minutos inclusos, chamada adicional US$ 0,08, mensagem US$ 0,003, **preço de pico US$ 0,16**, simultâneas. LLM e telefonia são cobrados **à parte, "a preço de custo"**.
- Programa para startups e FAQ com 9 perguntas.

Nossa versão: mesma mecânica (cards, calculadora, tabela e FAQ), mas **tudo incluso em R$**. A calculadora compara o custo com uma recepcionista. Não há seletor de LLM (o modo avançado é um add-on).
