# API_SPEC: protocolo de conversa e recursos REST da Recepta

## Referência observada (FATO): WebSocket do ElevenAgents
Fonte: `docs/eleven-agents/libraries/web-sockets.md` e `api-reference/eleven-agents/websocket.md`.

- **Do servidor para o cliente:** `conversation_initiation_metadata`, `audio`, `user_transcript`, `agent_response`, `agent_response_correction`, `interruption`, `ping`, `vad_score`, `client_tool_call`, `agent_tool_response`, `mcp_tool_call`.
- **Do cliente para o servidor:** `conversation_initiation_client_data`, `user_audio_chunk`, `pong`, `client_tool_result`, `contextual_update`, `user_message`, `user_activity`.
- **Autenticação:** por ID público do agente ou por **URL assinada** gerada no backend.

## Nosso protocolo (projeto próprio, compatível em conceito)
`wss://api.recepta.ai/v1/conversa?token=<jwt de sessão>`. Todas as mensagens são JSON `{ "tipo": string, ... }`.

| Direção | `tipo` | Campos | Quando |
|---|---|---|---|
| S→C | `sessao.iniciada` | `conversa_id`, `agente_id`, `formato_audio` (`pcm_16000` ou `ulaw_8000`) | após autenticar |
| C→S | `sessao.config` | `variaveis` (dinâmicas), `canal` (`web`, `telefone`, `whatsapp`) | primeira mensagem |
| C→S | `audio.entrada` | `pcm` (base64) | streaming contínuo |
| S→C | `transcricao.parcial` / `transcricao.final` | `texto`, `confianca` | STT |
| S→C | `agente.texto` | `texto`, `turno_id` | LLM, em streaming |
| S→C | `agente.audio` | `pcm` (base64), `turno_id`, `seq` | TTS, em streaming |
| S→C | `interrupcao` | `turno_id` | o cliente falou por cima (barge-in) |
| S→C | `ferramenta.chamada` | `chamada_id`, `nome`, `args` | ferramenta do lado do cliente |
| C→S | `ferramenta.resultado` | `chamada_id`, `resultado`, `erro?` | — |
| C→S | `contexto` | `texto` | atualização sem resposta (ex.: "cliente abriu o carrinho") |
| S→C | `ping` / C→S `pong` | `evento_id` | heartbeat de 15 s |
| S→C | `sessao.encerrada` | `motivo`, `duracao_s`, `minutos_cobrados` | fim |

## REST (v1)
| Recurso | Métodos |
|---|---|
| `/agentes` | `GET` lista, `POST` cria (opcional `fonte_url` para gerar a partir do site) |
| `/agentes/{id}` | `GET`, `PATCH`, `DELETE`; `POST /agentes/{id}/publicar` cria uma versão |
| `/agentes/{id}/versoes` | `GET`; `POST /agentes/{id}/versoes/{v}/restaurar` |
| `/agentes/{id}/simular` | `POST` (cenário, critério de sucesso, máximo de turnos), para testes |
| `/conhecimento` | `POST` (URL, PDF ou texto), `GET`, `DELETE` |
| `/numeros` | `GET`, `POST` (comprar número BR), `POST /numeros/{id}/vincular` |
| `/conversas` | `GET` (filtros: agente, resultado, data), `GET /conversas/{id}` (transcrição, gravação, resumo, dados extraídos e **custo**) |
| `/uso` | `GET`: minutos do ciclo, excedente e custo por componente |
| `/sessoes` | `POST` gera o token de sessão do widget (equivale à URL assinada) |

## Webhooks
`call.ended`: `{ conversa_id, agente_id, canal, de, duracao_s, minutos_cobrados, resultado: "resolvido" | "transferido" | "nao_resolvido", resumo, dados_extraidos, sentimento, custo_brl }`. O payload é assinado com HMAC-SHA256 no header `X-Recepta-Assinatura`.
