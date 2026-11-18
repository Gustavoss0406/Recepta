# Design: o que foi medido e o que adotamos

Fonte: `evidencias/home-styles.json` e `evidencias/agents-styles.json` (Playwright `getComputedStyle`, 16/11/2026, viewport de 1440×900).

## Divergências entre o `DESIGN.reference.md` e o site real (FATO)

| Token | DESIGN.reference.md | Medido no site | Adotamos |
|---|---|---|---|
| Fundo da página | `#f5f5f5` | `rgb(253,252,252)` = **`#fdfcfc`** | `#fdfcfc` |
| Tinta (texto principal) | `#0c0a09` | **`#000000`** (1.804 ocorrências) | `#000` |
| Texto secundário | `#4e4e4e` | `#777169` (124×) e `#59544f` | `#777169` / `#59544f` |
| Superfície de card ou painel | `#ffffff` | **`#f5f3f1`** (painéis cinza-quente) e `#ffffff` | ambos |
| Linha fina | `#e7e5e4` | **`#ebe8e4`** | `#ebe8e4` |
| Texto desabilitado | `#a8a29e` | `#a59f97` | `#a59f97` |
| H1 | 64px / 300 | **48px / 52px / -0.96px / 300** | 48 / 52 / -0.02em |
| H2 de seção | 36px | **36px / 42px / 300** (serif) | igual |
| Subtítulo (h2 Inter) | — | **Inter 16/24 +0.16px** | igual |
| Corpo | Inter 16 | Inter **18px / 28.8** na base; 15–16px em cards | igual |
| Botão do nav | 40px | **36px**, 14px, padding 0 14px, peso 400 | igual |
| Botão do hero | 40px | **44px**, 16px, padding 0 20px | igual |
| Botão secundário | outline transparente | **fundo branco** sobre o canvas (`#fff`), pill | branco com linha fina |
| Raios | 16 / 24 / pill | pill (131×), **16px** (61×), 4px (51×), 12px, 10px | pill / 16 / 10 / 4 |
| Mono | — | **Geist Mono** (código e rótulos) | Geist Mono (OFL) |
| Display | Waldenburg 300 | Waldenburg-ML 300 (licenciada) | **Newsreader 300** (OFL) |

## Padrões visuais observados (FATO, a partir das capturas)
1. **Grade de linhas finas:** linhas verticais e horizontais `#ebe8e4` emolduram o container (cerca de 1176px) e separam as faixas. Funciona como uma "planta baixa".
2. **Esferas de gradiente com volume** (não manchas desfocadas): esferas 3D com luz e textura. Elas representam vozes e agentes no carrossel do hero, na demo por categoria e no widget "Voz / Chat".
3. **Painel cinza `#f5f3f1` com raio de 16px** que contém produto: abas no topo, conteúdo no centro e pills de navegação embaixo.
4. **Bento grid** de 4 células com mockups do produto: editor de fluxo, esfera de voz, teste com guardrail e gráfico de resolução V1 × V2.
5. **Fotografia** de pessoas ao telefone no hero de Agentes, com balões de transcrição sobrepostos (karaokê palavra por palavra).
6. Cor saturada aparece **só dentro dos dados** (gráfico laranja e azul) e nos logos. A interface é monocromática.

## O que é nosso, para não haver confusão de marca
- Nome, logo, textos, fotos, ilustrações, vozes e casos de cliente: **todos próprios**.
- Display em **Newsreader** (não Waldenburg). Paleta das esferas: **menta, pêssego, lavanda e céu** do DESIGN.reference, renderizadas em CSS próprio.
- Não usamos logos de terceiros: a "faixa de confiança" vira uma **faixa de nichos atendidos**.
