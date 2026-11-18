# Catálogo de telas do ElevenLabs Agents (referência) → Recepta

## Fontes e evidências

- **Rotas do app**: REA `analyze-web-bundle` em `elevenlabs.io/app/sign-in?redirect=/app/agents`, com a view `javascript-routes`.
  - Evidence `ev_41fe08389fd5…71a7`; 211 rotas recuperadas, sem login.
  - Arquivos: `/home/user/rea-work/evidence/app-bundle.evidence.json` e `rotas-*.json`.
- **Telas reais**: 300 imagens e GIFs do painel, tirados de 423 páginas públicas da documentação (`/home/user/rea-work/telas/manifesto.json`).
  - As pranchas por área estão em `telas/prancha-*.jpg` e os quadros dos GIFs em `telas/quadros/`.
  - É material de terceiros usado só como referência e fica fora do repositório.
- **Componentes**: ElevenLabs UI (github.com/elevenlabs/ui, **MIT**), com Orb, waveform, conversa e audio player. Ver `THIRD_PARTY_NOTICES.md`.

## Rotas recuperadas (produto Agents)

As rotas abaixo foram extraídas pelo REA. Todas ficam sob `/app/agents`.

- **Globais**:
  - `agents`
  - `history` e `history/:conversationId/(details)`
  - `inbox` e `triage`
  - `knowledge-base`, `tools`, `integrations`
  - `batch-calling`, `campaigns`
  - `channels/telephony`, `channels/whatsapp`
  - `analysis`, `users`, `settings`
  - `voice-library`, `tickets`, `routines`
- **Do agente** (`agents/:agentId/…`):
  - `agent`, `workflow`, `subagents`, `procedures`
  - `knowledge-base`, `tools`
  - `analysis`, `analytics`, `guardrails`
  - `channels/widget`, `tests`, `history`, `inbox`, `triage`
  - `users`, `branches`, `settings`, `architect`, `campaigns`
- **Conta**: `/app/subscription`, `/app/settings`, `/app/workspace/members`.

## Padrões globais (FATO, extraídos dos quadros dos GIFs `b9cc21d13b45`, `592718e5df5f` e das telas do WhatsApp `b4fb46ff28ff` e `e9a0ac1e91b0`)

- **Fundo e superfícies**:
  - fundo do app branco `#fff`;
  - cards de configuração em cinza muito claro (`#f9f9f9`), com borda fina e raio de cerca de 16px;
  - itens selecionados em `#f2f2f2`.
- **Sidebar**, com cerca de 230px e fundo branco, de cima para baixo:
  1. Logo e botão de recolher.
  2. Seletor de produto ("Agents Platform ⌄").
  3. Home.
  4. Grupo **Configurar**: Agentes, Base de conhecimento, Ferramentas, Integrações, Vozes.
  5. Grupo **Monitorar**: Conversas, Usuários, Testes (selo "New").
  6. Grupo **Publicar**: Números de telefone, WhatsApp (selo "Alpha"), Saída.
  7. Configurações.
  8. Rodapé: Desenvolvedores, Notificações e conta (avatar, nome, workspace ⌄).
  - Rótulos de grupo pequenos em cinza e ícones de traço fino.
  - Item ativo com fundo cinza claro e cantos arredondados. Na versão mais nova, a sidebar pode recolher para só ícones.
- **Barra superior**: breadcrumb à esquerda ("Agentes › nome"). À direita, busca ("Buscar agentes ⌘K"), Feedback, Docs, Perguntar, sino e avatar.
- **Cabeçalho do agente**:
  - nome, selo "Público" e ID em mono cinza abaixo;
  - à direita: **Testar agente** (pílula preta com ícone de onda), Copiar link e ⋯;
  - na versão mais nova também Variáveis, Visualizar e **Publicar ▾**.
- **Abas do agente**: Agente, Workflow, Ramificações, Base de conhecimento, Análise, Ferramentas, Testes, Widget, Segurança, Avançado. O conteúdo fica centralizado, com largura máxima de cerca de 640px.
- **Linha de configuração**: card com título em peso 500 e descrição em cinza à esquerda, e o controle à direita (select, toggle ou botão "Adicionar").

## Telas → Recepta

| Referência ElevenLabs (rota e evidência) | Layout real | Tela da Recepta |
|---|---|---|
| `/app/agents` (lista) | Tabela: nome, criado por, data, ⋯; busca; botão preto "Novo agente" | `/painel/agentes` |
| `agents/:id/agent` (quickstart `9fcf565deeeb`, `language` `50f0d17ccaff`) | Cabeçalho do agente, abas, cards de configuração (idioma, primeira mensagem, prompt do sistema, LLM) | Editor › aba **Agente** (saudação, regras, tom, inteligência) |
| aba Voz (quickstart `9fcf565deeeb`) | Cards: Voz (select com bolinha de cor), modelo, formato | Editor › **Voz** |
| `agents/:id/workflow` (agent-workflows `c98d0c98b4e4`, `e03a124b10bf`, `4b428439f4e2`, `ad5354f74759`) | Canvas pontilhado; nós brancos (Início, Subagente, Ferramenta, Transferir, Fim); arestas com rótulos em pílula preta; Sucesso em verde e Falha em rosa; painel lateral do nó com abas Geral, Conhecimento e Ferramentas | Editor › **Workflow** (Fase E) |
| `agents/:id/knowledge-base` e `/app/agents/knowledge-base` (manage-documents `a131ee73f305`, `d710fcb67cd2`, `38085fef8b54`) | Lista com Adicionar URL, Adicionar arquivos, Criar texto e Criar pasta; busca; tabela nome, criado por, atualizado; modal "Adicionar URL" com abas URL única, Sitemap e Site inteiro | Editor › **Conhecimento** |
| `agents/:id/tools` (webhook-tools) | Lista de ferramentas com ícone e tipo ("webhook"); botão Adicionar ferramenta | Editor › **Ações** |
| `agents/:id/analysis` (success-evaluation `0c3e6cf33ead`, sentiment `4e151f38f35f`) | Cards: Critérios de avaliação (+ Adicionar critério) e Coleta de dados (+ Adicionar item) | Editor › **Análise** (dados coletados e critérios) |
| `agents/:id/tests` (agent-testing `b9cc21d13b45`, `664247579b15`, `bae434bd26c7`, `fac11b2d6b6b`) | Card "Testes" com Rodar todos (dropdown 3×, 5× ou 15×) e Adicionar teste; linhas com ▶ e ✕; criação em duas colunas (formulário + conversa); resultados com selo "8/10" em grupos aprovado e falha | Editor › **Testes** e `/painel/testes` |
| `agents/:id/channels/widget` (widget `c9ee762eb58c`, `ea9957ed3208`) | Cards: Interface (toggles), Aparência (variante Pequeno, Compacto, Completo; posição), Avatar (Orb com 2 cores), Textos | Editor › **Widget** (Fase E) |
| aba Segurança e guardrails | Cards de autenticação, overrides e guardrails | Editor › **Segurança** |
| aba Avançado (alerts `af2ded675e5b`, conversation-flow `f8e0e285f3fb`, `45690319ee42`) | Cards: tomar a vez após silêncio, timeout suave, eventos, alertas | Editor › **Avançado** (horários, limites) |
| `agents/:id/branches` (experiments `c9a9eb030698`, `24267ec27e8e`) | Tabela de ramificações com divisão de tráfego, selo "Live", "Dividir tráfego" e modal Publicar | Editor › **Versões** e A/B (Fase E) |
| `/app/agents/history` e `history/:id` (quickstart `c812790c012a`, testing `592718e5df5f`, success-evaluation `c562771f9ff2`) | Lista: data, agente, duração, mensagens e resultado da avaliação (selo verde "Sucesso" ou vermelho "Falha"); filtros em pílula (+ Data depois, + Data antes, + Avaliação, + Agente); detalhe com waveform e player, abas Visão geral, Transcrição e Dados do cliente, e painel **Metadados** à direita (data, duração, custo) | `/painel/ligacoes` e detalhe |
| `/app/agents/triage` e `inbox` (triage `347c3009ce3d`, `0a86572eaccb`) | "Triagem": abas Pendente, Em andamento e Resolvido; filtros Origem, Criador e Responsável; colunas título, origem ("Sinalizado pelo agente" ou "Execução de teste"), criador, responsável e status; + Novo ticket | **`/painel/pendencias`** (repasse para a equipe) |
| Dashboard de analytics (dashboard `5bb1028d1992`, `2314c17ac9a1`, `d00af0056c76`, `2c9cbe342e4f`; overview `b404e1accc10`) | "Workspace" + saudação; abas Geral, Avaliação, Coleta de dados, Áudio, Ferramentas, LLMs, Base de conhecimento, Avançado; filtros em pílula (Visões, Período, Granularidade, Agente, + Agrupar por); faixa de métricas que seleciona o gráfico (Nº de chamadas, Duração média, Custo total, Custo médio…); gráfico de linha azul com área; "Escala linear" e baixar; "Histórico filtrado ↗"; tópicos com sentimento e taxa de resolução | `/painel` (Início) e `/painel/analises` |
| `channels/telephony` (native-integration `120b155981dc`, `feb0afbfe9fd`, `a237703aa724`) | Duas colunas: lista de números com + e detalhe (número, ✓, rótulo; "Chamada de saída"; card "Chamadas recebidas" com select de agente); vazio "Nenhum número selecionado" | `/painel/numeros` |
| `channels/whatsapp` (`b4fb46ff28ff`, `e9a0ac1e91b0`) | Lista de contas, vazio com "Importar conta"; detalhe com card Agente e toggles de mensagens e áudio | `/painel/numeros` (seção WhatsApp) |
| `/app/agents/integrations` (overview `3644c99239b4`) | Grade de integrações com ícone de marca | `/painel/integracoes` (marcas abstratas) |
| `/app/subscription`, `/app/settings`, `workspace/members` | Páginas de conta | `/painel/cobranca`, `/painel/configuracoes` |
| Developers › Alertas (alerts `5ef0ed758145`) | Abas Visão geral, Chaves de API, Webhooks, Analytics, Log de requisições, Alertas | `/painel/configuracoes` (seção desenvolvedores) |

## Exclusivas da Recepta (sem equivalente)

Estas telas seguem o padrão visual da tela da ElevenLabs mais próxima:

- **Onboarding em 7 passos**: segue o padrão "card de configuração" e as abas.
- **Cobrança em R$**: segue o padrão de assinatura.
- **Desvio de chamadas**: segue o card "Chamadas recebidas" de números.
- **Painel interno de margem**: segue a tabela de analytics.
