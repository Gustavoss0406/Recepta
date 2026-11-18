# Plano do painel do contratante: configuração, testes e operação

> Status: **proposta para aprovação**. O painel não será construído antes de você aprovar este plano.
> Base de evidência: `docs/engenharia-reversa/FEATURE_MATRIX.md` e a documentação pública do ElevenAgents (barra lateral observada: Overview, Agents, Workflows, Branches, Knowledge, Analysis, Tools, Widget, Settings; testes de simulação, próxima resposta e chamada de ferramenta; testes probabilísticos; retenção padrão de 2 anos).

## 1. Princípios

1. **O dono de uma PME configura sozinho em 5 minutos.** Tudo tem um **modo simples**, com perguntas em português e sem jargão. O **modo avançado** (prompt bruto, fluxos, webhooks) existe, mas não aparece no primeiro uso.
2. **Nada vai ao ar sem ser ouvido.** Toda mudança vale para um **rascunho**. O botão "Testar" sempre usa o rascunho, e o botão "Publicar" gera uma versão que pode ser revertida.
3. **Testar é parte do produto, não um extra.** Toda tela de configuração tem um "testar isto agora" ao lado.
4. **Custo visível:** o cliente vê os minutos (o que paga). O custo de cada componente fica só no painel interno (a nossa margem).
5. **LGPD por padrão:** aviso de IA e de gravação **obrigatório** na saudação (não pode ser removido), retenção padrão de **90 dias** (a ElevenLabs usa 2 anos) e mascaramento de CPF ligado.

## 2. Papéis e permissões

| Papel | Pode | Não pode |
|---|---|---|
| **Dono** | Tudo, incluindo cobrança, equipe, LGPD e excluir a conta | — |
| **Gestor** | Criar e editar agentes, testar, publicar, ver ligações e análises | Cobrança, excluir a conta, mudar a retenção |
| **Atendente** | Ver ligações transferidas para ele, ouvir gravações, marcar para revisão | Editar agentes ou publicar |
| **Financeiro** | Uso, faturas, forma de pagamento | Ver transcrições |
| *Admin Recepta (interno)* | Margem por cliente, suporte com acesso auditado | Ver dados sem registrar um ticket |

## 3. Arquitetura de informação (barra lateral)

```
Início                 ← resumo do dia + checklist de configuração
Agentes                ← lista → editor do agente (abas, seção 5)
Ligações               ← conversas (telefone, WhatsApp, site)
Testes                 ← suítes, cenários, execuções
Análises               ← KPIs, ROI, tópicos, comparação de versões
Números e canais       ← números, desvio, WhatsApp, widget
Integrações            ← Google Agenda, CRMs, webhooks
Uso e cobrança         ← franquia, alertas, faturas, plano
Configurações          ← equipe, LGPD, API, marca
```
No celular, a barra lateral vira uma barra inferior com Início, Ligações, Agentes e Mais. O dono acompanha principalmente pelo celular.

## 4. Onboarding (primeiro acesso), um assistente em 7 passos

Barra de progresso, com tudo salvo a cada passo. Dá para sair e voltar.

| Passo | Tela | Detalhe e regras | Critério de aceite |
|---|---|---|---|
| 1 | **Sua empresa** | Nome, CNPJ (opcional no teste), nicho (cards com ícone) e cidade/fuso | O nicho define o modelo de prompt, os campos coletados e os testes sugeridos |
| 2 | **Seu site** | O cliente cola a URL e nós fazemos o crawl (até 50 páginas) com barra de progresso. O resultado é um **cartão "O que aprendemos"**: serviços, preços, horários, endereço, formas de pagamento e convênios, todos editáveis. Sem site, ele preenche um formulário guiado ou envia um PDF | O crawl termina em até 60 s em 90% dos sites. Cada fato extraído mostra de onde veio (página) |
| 3 | **Como o agente trabalha** | Perguntas simples: "O que ele deve fazer?" (agendar, tirar dúvidas, receber pedidos, triagem); "Quando transferir para uma pessoa?"; "O que ele nunca deve falar?". Isso gera o prompt pelo modelo do nicho | O prompt gerado é exibido no modo avançado e é reproduzível (mesmas respostas, mesmo prompt) |
| 4 | **Voz e saudação** | Carrossel com as 6 vozes (esferas e prévia). Saudação sugerida já com o aviso de IA e gravação. Controle de velocidade (0,9 a 1,15×) | O aviso não pode ser removido, só reescrito, e a validação confere se ainda está presente |
| 5 | **Teste agora** | Ligação pelo navegador (seção 6.1) e 3 cenários do nicho rodando sozinhos (seção 6.3) | O cliente precisa ouvir pelo menos uma resposta antes de avançar |
| 6 | **Seu número** | (a) **Desviar o número atual**: escolhe a operadora, vê o código pronto para copiar e clica em "Ligar para testar o desvio". O sistema detecta a chamada chegando e mostra "Desvio funcionando". (b) **Número novo**: escolhe o DDD e compra o número na hora | O desvio só é marcado como ativo depois que a chamada de verificação chega |
| 7 | **Publicar** | Checklist: conhecimento ok, voz ok, testes passando, número ok. Botão "Colocar no ar" | Publicar cria a versão v1. Os alertas de franquia ficam ligados por padrão |

**Códigos de desvio** para celular, no padrão GSM que as operadoras móveis brasileiras costumam usar. A tabela por operadora precisa ser validada antes do lançamento, e linhas fixas variam.

| Desvio | Código |
|---|---|
| Sempre | `*21*NÚMERO#` |
| Se não atender | `*61*NÚMERO#` |
| Se ocupado | `*67*NÚMERO#` |
| Fora de área | `*62*NÚMERO#` |
| Cancelar | `##21#` |

Recomendação padrão para PME: **"se não atender" + "ocupado"**. Assim, a equipe atende quando pode e o agente cobre o resto.

## 5. Editor do agente

Cabeçalho fixo com o nome do agente, o **seletor Rascunho ↔ v3 (publicada)**, o botão **Testar** (abre o painel de teste à direita), **Publicar** e um menu com duplicar, exportar e excluir.

| Aba | Modo simples | Modo avançado | Teste ao lado |
|---|---|---|---|
| **Visão geral** | Status, número, canais, últimas ligações e taxa de resolução da versão | — | — |
| **Comportamento** | Saudação; "O que fazer", "O que nunca fazer" e "Quando transferir" como listas editáveis; tom (formal ↔ descontraído) | Prompt completo, variáveis dinâmicas `{{nome_cliente}}` `{{data_hoje}}` `{{horario_comercial}}`, primeira mensagem por canal | "Testar próxima resposta" |
| **Conhecimento** | Fontes (site, PDF, texto, perguntas e respostas) com status (indexando / pronto / erro), "Atualizar do site" e data da última leitura | Tamanho dos trechos, fontes desativadas por agente | **"Pergunte ao conhecimento"**: o cliente digita uma pergunta e vê a resposta e o trecho usado |
| **Voz** | Voz, velocidade, prévia em **qualidade de telefone (8 kHz)** e em HD | **Dicionário de pronúncia** (ex.: "Dr." → "doutor", nomes próprios, siglas), Voz Ultra (add-on) | Tocar uma frase personalizada |
| **Ações** | Cards liga/desliga: **Agendar** (Google Agenda), **Transferir para pessoa** (número e horário), **Enviar WhatsApp** (confirmação, link Pix), **Encerrar ligação**, **Anotar recado**, **Sinalizar para revisão** | **Webhook** (URL, método, schema dos parâmetros, autenticação, timeout, som de espera), MCP (Fase 3) | "Testar ação" com dados fictícios |
| **Horários** | Horário comercial, feriados (lista nacional, estadual e municipal), comportamento fora do horário (recado + retorno) | Roteamento por DDD ou motivo | Simular "ligação às 22h de sábado" |
| **Dados coletados** | Campos que o agente deve obter: nome, telefone, motivo, convênio, placa do carro… (sugeridos pelo nicho) | Tipo, obrigatoriedade, validação (CPF, e-mail) | Ver extração em uma ligação de teste |
| **Segurança** | Temas proibidos, limite de duração da ligação, encerrar em silêncio (s), bloquear spam/robocall | Guardrails customizados, respostas fixas para temas sensíveis | Testes de **prompt injection** prontos |
| **Fluxos** *(Fase 3)* | Modelos de fluxo do nicho | Editor visual: nós Falar, Subagente, Ação, Atualizar estado, Transferir, Fim; arestas com condição em linguagem natural ou expressão | Executar o fluxo passo a passo |
| **Canais** | Telefone, WhatsApp e widget do site (snippet para copiar, cor, posição, texto do botão) | Domínios permitidos | Prévia do widget |
| **Versões** | Lista de versões com autor, data, nota, resultado dos testes e taxa de resolução; **Restaurar** | Comparar duas versões (diff de configuração); experimento A/B (Business) | — |

**Regras do rascunho e da publicação:**
- Editar cria ou atualiza o rascunho, com salvamento automático a cada 2 s e indicador "Salvo".
- **Publicar** roda a suíte de regressão (seção 6.5). Se um teste marcado como *crítico* falhar, a publicação é bloqueada, com um "publicar mesmo assim" para o Dono, que fica registrado no log.
- Ligações em andamento terminam na versão em que começaram.

## 6. Testes, o centro do painel

### 6.1 Ligação de teste no navegador
- Botão "Testar" no editor abre o painel lateral: microfone (WebRTC), esfera animando quando o agente fala e **transcrição ao vivo**.
- Uma linha do tempo mostra **o que o agente está fazendo**: "consultando agenda…", "transferindo…", com entrada e saída de cada ação.
- **Ações em modo seguro:** em teste, agendamentos vão para uma **agenda simulada**, a não ser que o cliente marque "usar agenda real".
- Ao final: resumo, dados extraídos, avaliação de sucesso e duração. Os minutos de teste **não contam na franquia** até 60 min/mês. Acima disso contam, com aviso.

### 6.2 "Ligue para o meu celular"
Teste por telefonia real, com áudio em 8 kHz, para sentir como o cliente final vai ouvir. Limite de 10 por dia por conta.

### 6.3 Cenários simulados (conversa inteira)
- Um LLM faz o papel de cliente seguindo uma persona e um objetivo. Um LLM-juiz avalia o **critério de sucesso**, escrito em linguagem natural.
- Campos: cenário, persona (pressa, idoso, irritado, sotaque forte), critério de sucesso, máximo de turnos (padrão 12) e **mocks de ação** (ex.: agenda retorna "sem horário quinta").
- **Biblioteca por nicho**, com cerca de 12 cenários cada. Exemplo para clínica:
  - remarcar consulta;
  - convênio não aceito;
  - urgência (deve orientar o pronto-socorro e transferir);
  - pede preço de procedimento que não existe;
  - fala o CPF (deve mascarar);
  - pede para falar com o médico;
  - ligação fora do horário;
  - tenta fazer o agente "ignorar as instruções" (injection);
  - cliente muda de ideia no meio;
  - silêncio prolongado.
- **Execução probabilística:** cada cenário roda N vezes (padrão 3, até 10) e mostra a **taxa de aprovação** (ex.: 3/3, 2/3), porque o LLM varia.

### 6.4 Testes pontuais
- **Próxima resposta:** um histórico de conversa, um critério ("deve oferecer 2 horários") e exemplos de boa e má resposta.
- **Chamada de ação:** dado o histórico, o agente deve chamar `agendar` com `{data, hora, nome}`. A validação pode ser exata, por regex ou por LLM.
- **Pronúncia:** lista de termos e números ("R$ 1.290,50", "CEP 01310-100") com áudio gerado. O cliente aprova de ouvido.

### 6.5 Suítes e regressão
- Cada agente tem uma **suíte**. Cada teste tem severidade: *crítico*, *importante* ou *informativo*.
- A suíte roda automaticamente **ao publicar**, **toda noite** (opcional) e **ao trocar de versão do modelo ou da voz** (do nosso lado).
- Relatório: aprovados, reprovados e instáveis; diff contra a última execução; link para a transcrição de cada falha.
- **"Transformar em teste":** em qualquer ligação real (aba Ligações), um botão cria um cenário com aquele começo de conversa e um critério sugerido. É assim que a suíte cresce com os casos reais.

### 6.6 Custo dos testes (margem)
A simulação roda **em texto** (sem STT nem TTS): cerca de 6 turnos de Haiku por execução, menos de R$ 0,01 cada. Limites por plano: Start 200 execuções/mês, Pro 1.000, Business 5.000. Tudo isso entra no registro de custo como `tipo=teste`.

## 7. Ligações (conversas)

- **Lista** com filtros: resultado (resolvido, transferido, recado, não resolvido), agente, versão, canal, período, sentimento, "sinalizadas" e tags. Busca por texto ou por significado ("clientes reclamando de atraso").
- **Detalhe:** player com a transcrição sincronizada (clique na frase para pular o áudio), linha do tempo de ações, dados extraídos, resumo, avaliação de sucesso com justificativa, minutos cobrados e a versão do agente.
- **Ações:** sinalizar, comentar, "transformar em teste", baixar a gravação (Dono e Gestor) e **excluir dados do titular** (LGPD).
- **Notificações:** resumo de cada ligação por WhatsApp e e-mail (configurável: todas, só as não resolvidas, ou resumo diário).

## 8. Análises

- **KPIs do período:** ligações atendidas, **fora do horário (ligações que seriam perdidas)**, taxa de resolução, transferências, agendamentos ou pedidos gerados, duração média e minutos usados.
- **ROI:** "O agente atendeu 412 ligações; 96 fora do horário; 58 viraram agendamento". O valor médio por agendamento é informado pelo cliente.
- Gráficos de volume por hora e dia da semana (para dimensionar as chamadas simultâneas) e de resultado ao longo do tempo.
- **Tópicos:** agrupamento automático dos motivos de contato.
- **Comparação de versões** e experimentos A/B (Business): divisão de tráfego, métrica alvo e "promover vencedora".

## 9. Números e canais, integrações, cobrança e configurações

- **Números:** lista, comprar por DDD, verificação de desvio (seção 4), qual agente atende cada número e horário.
- **WhatsApp:** conexão pelo cadastro incorporado da Meta, templates aprovados e status.
- **Widget:** snippet, aparência e domínios.
- **Integrações:** cards com status (conectado, erro, expirado), OAuth (Google), **log das últimas 100 chamadas** de cada integração e "testar conexão".
- **Webhooks:** URL, eventos (`call.ended`, `call.transferred`, `test.failed`), segredo HMAC, **enviar evento de teste** e log de entregas com reenvio.
- **Uso e cobrança:**
  - barra da franquia e **previsão de fim de mês** (pelo ritmo atual);
  - alertas em 80% e 100%, teto mensal opcional, excedente acumulado;
  - fila ou pico (seção do plano), faturas (Pix, boleto, cartão), troca de plano com pro-rata.
- **Configurações:** equipe e papéis, **LGPD** (retenção de áudio e de transcrição em dias, mascaramento, exportar ou excluir dados por telefone do titular, DPA para baixar), chaves de API, marca e fuso horário.

## 10. Painel interno (Recepta)

- **Margem por cliente:** receita versus custo real do registro de custo (telefonia, STT, TTS, LLM, infra), com alerta abaixo de 25%.
- Ranking de custo por minuto e detecção de abuso: ligações longas em silêncio, robocalls, picos anômalos.
- Saúde dos provedores (latência p50 e p95 por motor, taxa de erro) e **fallback** de TTS e STT.
- Acesso de suporte à conta do cliente, com motivo obrigatório e log de auditoria visível para o cliente.

## 11. Modelo de dados (principais entidades)

`Organizacao` · `Usuario` · `Membro(papel)` · `Agente` · `AgenteVersao(config JSON imutável)` · `FonteConhecimento` · `TrechoConhecimento(embedding)` · `Acao` · `Integracao(credencial cifrada)` · `Numero` · `Canal` · `Conversa` · `Turno` · `ChamadaAcao` · `Extracao` · `Avaliacao` · `CasoTeste` · `ExecucaoTeste` · `Experimento` · `RegistroCusto` · `Fatura` · `LogAuditoria`

Regras:
- `Conversa.agente_versao_id` é obrigatório, para que dê para saber qual versão atendeu.
- Toda tabela tem `organizacao_id`, com Row Level Security no Postgres.

## 12. Como vamos testar o painel (nossa engenharia)

| Camada | O quê | Ferramenta | Meta |
|---|---|---|---|
| Unitário | Preços e margem (já existe, 20 testes), compilador de prompt (modo simples → prompt), validação do aviso LGPD, regras de rascunho e publicação | Vitest | 100% das regras de cobrança e de LGPD |
| Integração | Pipeline de voz com provedores **mockados** (STT, TTS e LLM falsos e determinísticos), webhooks, registro de custo | Vitest + servidor de teste | Registro de custo bate com os mocks ao centavo |
| E2E | Onboarding completo, editar → testar → publicar → restaurar, transformar ligação em teste, alertas de franquia | Playwright (desktop e celular) | Fluxos críticos verdes a cada PR |
| Isolamento entre clientes | Usuário da org A tenta ler dados da org B (API e UI) | Testes automatizados de RLS | 0 vazamentos |
| Voz e latência | p50 ≤ 800 ms e p95 ≤ 1,5 s de voz a voz; barge-in; 100 ligações por nicho | Harness de chamadas SIP | Gate antes de cada release |
| Carga | Chamadas simultâneas por plano mais burst | k6 + simulador SIP | Sem degradação até 2× o limite do maior plano ativo |
| Caos | Motor TTS ou STT fora do ar → fallback; Google Agenda fora → agente anota o recado | Injeção de falhas | Nenhuma ligação cai por falha de provedor |
| Acessibilidade | Teclado, leitores de tela, contraste | axe + revisão manual | WCAG AA |
| LGPD | Exclusão do titular apaga áudio, transcrição e extrações; retenção expira no prazo | Testes agendados | 100% |

## 13. Entregas (sprints de 2 semanas)

| Sprint | Entrega | Critério de pronto |
|---|---|---|
| S1 | Shell do painel (barra lateral, autenticação, organização, papéis), Início com checklist | Login, convite de equipe e RLS testada |
| S2 | Onboarding passos 1 a 4 (empresa, crawl do site, comportamento, voz) e compilador de prompt | Um agente é criado a partir de uma URL real |
| S3 | **Pipeline de voz e teste no navegador** (seção 6.1), registro de custo por chamada | Conversa por voz com p50 ≤ 800 ms |
| S4 | Números e desvio com verificação, aba Ligações (lista e detalhe), resumo por WhatsApp | Primeira ligação real atendida e resumida |
| S5 | **Testes:** cenários simulados, biblioteca do nicho, testes pontuais, suíte e bloqueio de publicação, "transformar em teste" | Suíte de clínica com 12 cenários rodando 3× cada |
| S6 | Editor completo (Ações, Horários, Dados coletados, Segurança, Versões) | Restaurar versão em 1 clique |
| S7 | Análises e ROI, uso e cobrança (Asaas/Pagar.me, alertas, teto) | Fatura de teste paga por Pix |
| S8 | Integrações (Google Agenda, webhooks), LGPD completa, painel interno de margem, piloto com 10 empresas | Critérios da seção 12 verdes |

Fase 3, depois do piloto: editor visual de fluxos, A/B, WhatsApp conversacional e integrações de CRM.

## 14. Decisões que preciso de você

1. **Minutos de teste grátis por mês:** proponho 60 min de teste no navegador fora da franquia. Ok?
2. **Retenção padrão:** proponho 90 dias para áudio e 1 ano para transcrição. Ok?
3. **Bloqueio de publicação** quando um teste crítico falha: o Gestor também pode forçar, ou só o Dono?
4. **Nichos do lançamento:** proponho começar com 3 (clínicas, imobiliárias e restaurantes), cada um com biblioteca de testes completa. Quais você quer?
5. **Agenda:** Google Agenda primeiro e depois iClinic/Feegow? Ou algum sistema de nicho é mais urgente?
