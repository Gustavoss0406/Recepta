# Onboarding em conversa: roteiro

No primeiro acesso, o dono não preenche formulário. Ele conversa com a **Recepta**, a agente de onboarding: um orb, chat e voz, com microfone do navegador. Enquanto isso, o **fluxo de atendimento** se monta ao vivo ao lado. Cada resposta cria etapas, condições e ações. Os cursores dos "construtores" se movem até o ponto do fluxo que está sendo editado.

A implementação do roteiro está em `src/lib/onboarding/perguntas.ts`. O gerador do fluxo fica em `src/lib/onboarding/gerador.ts`.

## Regras da conversa

- **Uma pergunta por vez**, em tom informal. A Recepta reage ao que a pessoa disse ("Show, imobiliária! Adoro.") antes de perguntar.
- **Nunca pergunta duas vezes.** Se a pessoa já respondeu algo de passagem, como "sou a Imobiliária Lar em Campinas" (nome e cidade de uma vez), a pergunta correspondente é pulada.
- **Sempre dá para pular.** O botão "Pular" usa um padrão sensato, e a pergunta não volta.
- **Dúvida do dono:** se ele pergunta "como assim?", a Recepta explica com um exemplo e repete a pergunta.
- **Explica o que mudou no fluxo.** Toda resposta que cria etapas vem com um comentário curto do tipo "Coloquei um caminho de alto padrão: acima de R$ 1,5 mi vai para o corretor sênior".
- **Respostas rápidas:** sugestões em botões (chips) para quem está no celular.
- **Finalizar a qualquer momento:** depois das perguntas base, aparece a opção "Já está bom, finalizar". O fluxo fica pronto com o que se sabe até ali, e o restante usa padrões.

## Camada 1: perguntas base (todo negócio)

| id | Pergunta | O que vira no fluxo |
|---|---|---|
| `negocio` | Me conta, qual é o seu negócio? | Escolhe o nicho e o pacote de perguntas dinâmicas. Cria a Recepção e a triagem. |
| `empresa` | Como a empresa se chama, e em que cidade vocês ficam? | Saudação com o aviso de atendimento virtual e gravação. Nó "Falar: saudação". |
| `servicos` | O que vocês mais vendem ou atendem? Se tiver preço, melhor ainda. | Etapa "Dúvidas" com a consulta à base. Cada serviço vira um caminho de dúvida e de oferta. |
| `motivos` | Quando o telefone toca, quais são os motivos mais comuns? | Um tópico de triagem por motivo. |
| `horario` | Qual o horário de funcionamento? | Condição `dentro_do_horario`, que separa o fluxo dentro e fora do horário. |
| `agenda` | Vocês marcam horário (consulta, visita, reserva)? | Bloco de agendamento: consultar horários, agendar com sucesso ou falha, remarcar e cancelar. |
| `fora` | Quando vocês não estão atendendo, o que eu faço? | Ramo de fora do horário: marcar mesmo assim, registrar recado ou plantão para urgências. |
| `pessoa` | E se o cliente pedir para falar com alguém da equipe? | Transferir dentro do horário, ou repasse com relatório. |
| `site` | Tem site? Eu leio e aprendo tudo sozinha. | Base de conhecimento indexada. |
| `recepcionista` | Como você quer que eu me chame, e qual o jeito: mais formal ou descontraída? | Nome e tom da recepcionista. |

## Camada 2: perguntas dinâmicas (dependem do modelo de negócio)

**Imobiliária**
- `imob_operacao`: Vocês trabalham com venda, aluguel ou os dois? Cria os ramos Compra e Locação, com perguntas de qualificação diferentes.
- `imob_regioes`: Quais bairros ou regiões vocês atendem? Fora da região, a Recepta registra o pedido e indica.
- `imob_alto_padrao`: E quando o imóvel for caro demais, o que eu faço? Define o limite em R$ e a ação: corretor sênior, pré-qualificação ou visita só com o gerente.
- `imob_financiamento`: Se perguntarem de financiamento ou FGTS, eu explico ou passo para alguém? Caminho para o correspondente bancário.
- `imob_visita`: Para visitar, precisa de alguma coisa (documento, chave, ir com o corretor)? Checklist da visita antes de agendar.
- `imob_captacao`: E proprietário querendo anunciar o imóvel com vocês? Fluxo de captação: dados do imóvel e avaliação.
- `imob_inquilino`: Inquilino ligando com problema (vazamento, boleto), como funciona? Separa a urgência da manutenção do boleto e da segunda via.

**Clínica / saúde / estética**
- `cli_especialidades`: Quais especialidades ou profissionais atendem aí?
- `cli_convenios`: Atendem convênio? Quais?
- `cli_urgencia`: Se alguém ligar com sintoma grave, o que eu falo? Orientação SAMU 192 e repasse urgente.
- `cli_retorno`: Retorno tem prazo ou custo diferente?
- `cli_receitas`: Pedido de receita, atestado ou resultado de exame, como fica? Repasse para a equipe clínica, sem orientação médica.

**Restaurante / alimentação**
- `rest_reserva`: Aceitam reserva? Até quantas pessoas, e quanto tempo de tolerância?
- `rest_delivery`: Fazem delivery ou retirada? Por onde pede?
- `rest_eventos`: E grupos grandes ou eventos? Fluxo de orçamento de evento.
- `rest_alergias`: Se perguntarem de alergia ou restrição, eu respondo ou consulto a cozinha?

**Outros serviços** (oficina, pet, escola, advocacia…)
- `srv_orcamento`: Vocês passam orçamento por telefone ou precisa de visita?
- `srv_local`: Vocês vão até o cliente ou ele vem até vocês? Até onde atendem?
- `srv_urgencia`: Existe situação urgente no seu ramo? O que é urgente?
- `srv_garantia`: E pós-venda, garantia ou retrabalho, como funciona?

## Camada 3: perguntas avançadas (dono e operação)

Esta camada começa depois que a Recepta já entende o negócio. A partir daí, ela conhece o dono e monta os fluxos avançados.

| id | Pergunta | O que vira no fluxo |
|---|---|---|
| `vip` | Tem cliente especial (recorrente, VIP) que merece atendimento diferente? | Condição `cliente_identificado`, que leva ao atendimento VIP com prioridade. |
| `reclamacao` | Quando alguém liga reclamando, quem resolve e em quanto tempo retorna? | Fluxo de reclamação: acolher, registrar com urgência alta e prazo. |
| `cancelamento` | Tem regra de cancelamento ou de falta? | Política aplicada em "Remarcar ou cancelar". |
| `desconto` | Posso negociar preço ou dar desconto? Até quanto? | Limite de negociação. Acima dele, repasse. |
| `confirmacao` | Quer que eu confirme e lembre os horários por WhatsApp? | Ação `enviar_whatsapp` depois de agendar. |
| `sistemas` | Usam algum sistema ou CRM? | Sugestão de integração e consulta ao cadastro. |
| `aviso` | Quando eu passar um caso para você, prefere WhatsApp ou e-mail? | Notificação do repasse. |
| `nunca` | Tem algo que eu nunca devo falar ou prometer? | Regras de segurança. |
| `vendedores` | E vendedor ou telemarketing ligando, eu dispenso? | Filtro de spam no começo do fluxo. |
| `extra` | Mais alguma situação específica que eu deveria saber? (até 3×) | **Regra livre:** cada situação vira um caminho próprio, com condição, etapa dedicada e repasse se precisar. |

## Do perfil ao fluxo

As respostas vão para um **perfil** (chave → valor normalizado, mais regras livres). O gerador lê o perfil e monta o fluxo de forma determinística: o mesmo perfil gera sempre o mesmo fluxo. O resultado é testável e diferente para cada negócio.

O fluxo final tem começo, meio e fim:

- **Começo:** Início, saudação, filtro de vendedores, identificação do cliente (com o ramo VIP), checagem de horário e Recepção.
- **Meio:** um tópico por assunto. Cada um tem consultas, condições sobre os dados, ações com caminhos de sucesso e falha e caminhos de repasse. Um perfil completo passa de 100 nós e 200 conexões.
- **Fim:** "Mais alguma coisa?", despedida com o nome do cliente e encerramento.

## Experiência na web e no celular

- **Desktop:** à esquerda, a conversa (orb, mensagens, chips e microfone). À direita, o canvas do fluxo em tela cheia, com cursores, zoom e arrasto, e a câmera acompanhando o trecho que está sendo construído.
- **Celular:** o canvas fica no topo, em uma faixa de cerca de 40% da altura que pode ser expandida, com a conversa embaixo. O teclado não cobre a caixa de texto (`dvh`). Os chips rolam na horizontal.
- **Voz:** o microfone usa o reconhecimento de fala do navegador (pt-BR) quando está disponível. Sem ele, a conversa segue por texto.
- **No fim:** o resumo mostra quantas etapas e conexões foram montadas. Os botões são "Testar minha recepcionista" (o painel de teste do passo 5) e "Abrir no editor".

## Testes

- **Unitários:** seleção de perguntas por nicho; pergunta nunca repetida; extração local (sem LLM); gerador com fluxo válido (`validarWorkflow`), mais de 100 nós num perfil completo e determinismo; perfis diferentes geram fluxos diferentes.
- **Simulação:** usuários-robô (imobiliária detalhista, clínica apressada, restaurante que pula tudo, oficina que faz perguntas de volta). Cada um percorre a conversa inteira, e a transcrição é gravada em `docs/onboarding/simulacoes/`.
- **E2E gravado:** Playwright grava em vídeo, no desktop e no celular, a jornada de um dono de imobiliária.
