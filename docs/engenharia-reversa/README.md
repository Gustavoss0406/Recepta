# Engenharia reversa (Fase 1), clean-room

Alvo: páginas **públicas** de elevenlabs.io (`/pt`, `/pt/agents`, `/pt/pricing/agents`) e a **documentação pública** (`elevenlabs.io/docs/eleven-agents/*`). O painel logado não foi acessado. Nenhum código, texto, imagem, logo ou voz foi copiado para o produto. Copiamos apenas comportamento, arquitetura de informação e medidas de estilo, que são fatos.

## Ferramentas e evidências

| Passo | Ferramenta | Comando ou fonte | Evidence ID / arquivo |
|---|---|---|---|
| Estrutura e acessibilidade da home | REA `inspect-web-page` | CDP em `127.0.0.1:9222`, observação de 3 s, `--include-accessibility-text` | `ev_c8724df8…0622` → `evidencias/home-outline.txt` |
| Estrutura da página de Agentes | REA `inspect-web-page` | idem | `ev_a1c04ff8…7014` → `evidencias/agents-outline.txt` |
| Estrutura da página de preços | REA `inspect-web-page` | idem | `ev_33593034…d592` → `evidencias/pricing-outline.txt` |
| Endpoints do bundle JS (página de Agentes) | REA `analyze-web-bundle` (view `endpoints`) | | `ev_a026c4df…bf22`: **cobertura vazia** (scripts não retidos na janela de observação). Os endpoints vieram da doc pública |
| Estilos computados, desktop 1440 e mobile 390 | Playwright via CDP (`scripts/styles.cjs`) | `getComputedStyle` em h1, h2, h3, p, botões, seções, raios e cores | `evidencias/*-styles.json` |
| Texto expandido (FAQ e tabela de preços) | Playwright (`scripts/text.cjs`) | | `evidencias/pricing-text.txt` |
| Funções do produto | Doc pública `llms.txt` | `docs/eleven-agents/llms.txt` (445 entradas) e `api-reference/llms.txt` (258) | ver `FEATURE_MATRIX.md` |

As capturas de tela de referência ficam **fora do repositório** (`/home/user/rea-work/screens`), porque são material de terceiros usado só para análise.

## Entregáveis
- [`SITE_SPEC.md`](SITE_SPEC.md): mapa de seções e interações de cada página.
- [`DESIGN_MEDIDO.md`](DESIGN_MEDIDO.md): tokens medidos comparados com o `DESIGN.reference.md` e o que adotamos.
- [`FEATURE_MATRIX.md`](FEATURE_MATRIX.md): funções do ElevenAgents, prioridade no nosso produto e o que muda.
- [`API_SPEC.md`](API_SPEC.md): nosso protocolo de conversa e os recursos REST.

Convenção usada em todo o material: **FATO** foi observado com evidência, **INFERÊNCIA** é dedução nossa e **DESCONHECIDO** não foi possível confirmar.
