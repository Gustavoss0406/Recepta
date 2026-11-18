# FEATURE_MATRIX: ElevenAgents × Recepta

Fonte (FATO): índice público `elevenlabs.io/docs/eleven-agents/llms.txt` (445 páginas) e as páginas baixadas em `/home/user/rea-work/evidence/doc-*.md`.
Prioridades: **P0** entra no MVP (Fase 2), **P1** entra na Fase 3, **P2** vem depois ou não fazemos.

## Construir o agente
| Função (ElevenAgents) | Evidência (doc) | Prioridade | Recepta |
|---|---|---|---|
| Prompt do sistema e primeira mensagem | build/overview, prompting-guide | P0 | Editor com **modelos por nicho** e gerador a partir da URL do site |
| Escolha de LLM, cascata e LLM próprio | customization/llm, llm-cascading, custom-llm | P0/P2 | Haiku 5.5 padrão, Sonnet 5.5 como "modo avançado". Sem LLM do cliente |
| Workflows visuais (nós subagent, say, dispatch tool, update state, agent transfer, transfer to number, end; arestas com condição de LLM ou expressão) | customization/agent-workflows | P1 | Editor de fluxos com os mesmos tipos de nó |
| Procedures (livres e estruturadas) | customization/procedures | P1 | "Roteiros" por tarefa (agendar, cancelar, segunda via) |
| Voz: multi-voz, dicionário de pronúncia, velocidade, modo expressivo, ambiente de áudio, idioma | customization/voice/* | P0 (voz, velocidade, pronúncia) / P1 | Catálogo próprio e dicionário pt-BR (CPF, CEP, siglas) |
| Base de conhecimento e RAG | knowledge-base, rag | P0 | URL do site, PDF e texto; pgvector |
| Ferramentas: webhook, client, code, MCP | customization/tools/* | P0 (webhook) / P1 (MCP) | Webhooks e integrações nativas |
| **Ferramentas de sistema**: encerrar chamada, detectar idioma, transferir agente, **transferir para número**, pular turno, **DTMF**, **caixa postal**, atualizar estado, sinalizar para revisão | system-tools | P0 (encerrar, transferir para número, sinalizar) / P1 | Igual; "transferir para humano" com o número da empresa |
| Personalização: variáveis dinâmicas e overrides | personalization/* | P0 | `{{nome_cliente}}`, `{{horario}}` e dados do CRM |
| Autenticação do agente (URL assinada) | authentication | P0 | Token de sessão do widget |
| Integrações (Cal.com, Calendly, Google Calendar, HubSpot, Salesforce, Zendesk, Slack…) | integrations/* | P0 (Google Agenda) / P1 | **Google Agenda, WhatsApp, RD Station, Pipedrive, HubSpot, Bling, iClinic/Feegow** |
| "Architect", um assistente que edita o agente | operate/architect | P2 | "Criar agente a partir do site" cobre o caso inicial |

## Canais e telefonia
| Função | Evidência | Prioridade | Recepta |
|---|---|---|---|
| SIP trunking e Twilio nativo | phone-numbers/* | P0 | Número BR incluso e **desvio do número atual** |
| Widget web (customizável) e chat mode | customization/widget, chat-mode | P0 | Widget com esfera |
| WhatsApp (entrada, saída, templates, interativo) | whatsapp/* | P1 | Resumo pós-chamada e confirmação no P0; conversa no P1 |
| SMS | sms-conversations | P2 | — |
| Ligações em lote e campanhas | batch-calls, campaigns | P2 | Lembrete de consulta (P1, com opt-in, sem telemarketing) |
| Fila de chamadas com áudio de espera | guides/call-queueing | P1 | Fila quando as simultâneas estouram |
| Burst (exceder a concorrência a 2× o preço) | guides/burst-pricing | P1 | Igual, com minuto em dobro |
| Teams, Genesys, Five9, Amazon Connect | — | P2 | — |

## Operar
| Função | Evidência | Prioridade | Recepta |
|---|---|---|---|
| Testes: simulação, próxima resposta, chamada de ferramenta, mocks | customization/agent-testing | P1 | Simulação com LLM fazendo o papel de cliente |
| Experimentos A/B (variante, tráfego, promover vencedor) | operate/experiments | P1 | A/B no plano Business |
| Versionamento, branches e merge proposals | operate/versioning, merge-proposals | P1 (versões) / P2 (branches) | Versões com "publicar" e "voltar" |
| Análise de conversa: avaliação de sucesso, coleta de dados, sentimento, busca | agent-analysis/* | P0 (sucesso, coleta, resumo) / P1 | Resumo, motivo, resultado e dados extraídos |
| Dashboard de analytics, Spotlight (insights e tópicos), monitoramento em tempo real | dashboard/* | P0 (básico) / P1 | Painel de **ROI**: atendidas, recuperadas, agendamentos |
| Alertas e OpenTelemetry | operate/alerts, opentelemetry | P1 | Alerta de margem e de falhas |
| Privacidade: retenção, gravação de áudio, redação, Zero Retention | privacy/* | P0 | **LGPD**: retenção configurável, aviso de gravação, redação de CPF |
| Post-call webhooks | workflows/post-call-webhooks | P0 | Webhook `call.ended` com resumo e custo |
| Eventos de cliente e WebSocket | events/*, libraries/web-sockets | P0 | Ver `API_SPEC.md` |
| SDKs (Python, React, RN, JS, Kotlin, Swift, Unity) e CLI | libraries/* | P1 (JS/React) / P2 | SDK JS e React |
| Usuários e permissões | operate/users | P0 | Assentos por plano |
| Disclosure, TCPA, HIPAA | legal/* | P0 | **Aviso de IA e de gravação** na saudação; LGPD |
