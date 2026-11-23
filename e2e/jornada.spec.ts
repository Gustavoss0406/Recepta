import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Full contractor journey: sign up → 7-step onboarding → text test → forwarding → publish
 * (critical-test gate) → choose plan → pay → voice call through the real voice pipeline
 * (fake microphone) → call appears in Ligações → usage reflects it.
 *
 * Run the app, voice gateway and worker with LLM_MOTOR=demo: the free LLM rotation answers
 * non-deterministically, and this journey asserts exact tool calls.
 */
const email = `e2e+${Date.now()}@recepta.test`;
const audio = path.resolve(import.meta.dirname, "fixtures/cliente.wav");

test.use({
  permissions: ["microphone"],
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${audio}`, "--autoplay-policy=no-user-gesture-required"],
  },
});

async function semErros(page: Page) {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  return erros;
}

test("jornada completa do contratante", async ({ page }) => {
  const erros = await semErros(page);

  // 1. Cadastro
  await page.goto("/");
  await page.getByRole("link", { name: "Teste grátis" }).first().click();
  await expect(page).toHaveURL(/criar-conta/);
  await page.getByLabel("Seu nome").fill("Ana Souza");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senhaforte123");
  await page.getByLabel("Nome da empresa").fill("Clínica Sorriso E2E");
  await page.getByRole("button", { name: "Criar conta grátis" }).click();
  await expect(page).toHaveURL(/painel\/comecar/);
  await expect(page.getByTestId("onboarding-conversa")).toBeVisible();
  // this journey uses the form onboarding (the conversation has its own spec)
  await page.getByRole("link", { name: "Prefiro formulário" }).click();

  // 2. Passo 1 — empresa
  await page.locator('input[name="cidade"]').fill("Campinas");
  await page.locator('input[name="telefoneContato"]').fill("(19) 98888-7777");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/passo=2/);

  // 3. Passo 2 — conhecimento em texto
  await page.getByText("Não tenho site").click();
  await page
    .locator('textarea[name="texto"]')
    .fill("Clínica Sorriso. Limpeza dental R$ 180. Clareamento R$ 900. Aceitamos Unimed e Bradesco Saúde. Estacionamento gratuito. Endereço: Rua das Flores, 100, Campinas.");
  await page.getByRole("button", { name: "Ler e aprender" }).click();
  await expect(page.getByText("O que aprendemos")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar e continuar" }).click();
  await expect(page).toHaveURL(/passo=3/);

  // 4. Passos 3 e 4
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page).toHaveURL(/passo=4/);
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page).toHaveURL(/passo=5/);

  // 5. Teste em texto: agenda de verdade (agenda simulada)
  await page.getByRole("button", { name: "Começar teste" }).click();
  await expect(page.getByText(/recepcionista virtual\. A ligação é gravada/)).toBeVisible();
  const msg = page.getByLabel("Mensagem do cliente");
  await msg.fill("Quero marcar uma consulta");
  await msg.press("Enter");
  await expect(page.getByText("Consultou a agenda")).toBeVisible({ timeout: 30_000 });
  await msg.fill("Pode ser o primeiro horário");
  await msg.press("Enter");
  await expect(page.getByText("Agendou").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Encerrar" }).click();
  await expect(page.getByText("Resumo da conversa")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/passo=6/);

  // 6. Desvio + verificação
  await page.locator('input[name="desvioDe"]').fill("(19) 3333-4444");
  await page.getByRole("button", { name: "Salvar desvio" }).click();
  await expect(page.getByText("*61*")).toBeVisible();
  await page.getByRole("button", { name: "Verificar desvio" }).click();
  await expect(page.getByText(/Verificação simulada concluída/)).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/passo=7/);

  // 7. Publicar (testes críticos rodam antes)
  await page.getByRole("button", { name: "Rodar testes e publicar" }).click();
  await expect(page).toHaveURL(/painel\?publicado=1/, { timeout: 90_000 });
  await expect(page.getByText("Sua recepcionista está no ar")).toBeVisible();

  // 8. Plano + pagamento (gateway simulado)
  await page.goto("/painel/cobranca");
  await page.getByRole("button", { name: "Mudar para Start" }).click();
  await expect(page).toHaveURL(/cobranca\/pagar\//);
  await page.getByRole("button", { name: "Simular pagamento via Pix" }).click();
  await expect(page.getByText("Pagamento confirmado")).toBeVisible();
  await expect(page.getByText("Plano Start (mensal)").first()).toBeVisible();

  // 9. Ligação simulada por voz (microfone falso → Deepgram → agente → voz)
  await page.goto("/painel/numeros");
  await page.getByRole("button", { name: "Simular ligação" }).click();
  await expect(page.getByText("Ouvindo…").or(page.getByText(/Agente falando/))).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("li.text-right").first()).toContainText(/consulta/i, { timeout: 45_000 }); // transcribed customer speech
  await expect(page.getByText(/resposta em \d+ ms/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Desligar" }).click();
  await expect(page.getByText("Resumo da conversa")).toBeVisible({ timeout: 30_000 });

  // 10. A ligação aparece em Ligações e o uso de teste por voz sobe
  await page.goto("/painel/ligacoes?testes=1");
  await expect(page.getByText(/· Simulador/).first()).toBeVisible();

  // 11. A gravação da ligação por voz fica disponível no detalhe (player + rota de áudio protegida)
  await page.getByText(/· Simulador/).first().click();
  await expect(page.getByRole("button", { name: "Ouvir gravação" })).toBeVisible();
  const idLigacao = page.url().split("/").pop()!;
  const audio = await page.request.get(`/api/ligacoes/${idLigacao}/audio`);
  expect(audio.status()).toBe(200);
  expect(audio.headers()["content-type"]).toBe("audio/wav");
  expect((await audio.body()).length).toBeGreaterThan(16_000);

  // 12. Pendências: a equipe cria, assume e resolve um caso
  await page.goto("/painel/pendencias?novo=1");
  await page.getByLabel("O que o cliente quer").fill("Retornar orçamento de clareamento");
  await page.getByLabel("Telefone").fill("+55 19 99999-0000");
  await page.getByRole("button", { name: "Criar caso" }).click();
  await expect(page.getByRole("heading", { name: "Retornar orçamento de clareamento" })).toBeVisible();
  await page.getByRole("button", { name: "Em andamento" }).click();
  await expect(page.getByRole("button", { name: "Em andamento", pressed: true })).toBeVisible();
  await page.getByRole("button", { name: "Resolvido" }).click();
  await expect(page.getByText(/Resolvido em/)).toBeVisible();

  // 13. Widget do site: um site de terceiros instala o script e o visitante conversa por voz
  await page.goto("/painel/agentes");
  const agenteId = (await page.locator('a[href^="/painel/agentes/"]').first().getAttribute("href"))!.split("/").pop()!;
  const base = new URL(page.url()).origin;
  await page.setContent(`<!doctype html><html><body><h1>Site da clínica</h1><script src="${base}/widget.js" data-agente="${agenteId}" data-texto="Fale com a gente" async></script></body></html>`);
  await page.locator("[data-recepta]").getByRole("button", { name: "Fale com a gente" }).click();
  const widget = page.frameLocator("[data-recepta] iframe");
  await widget.getByRole("button", { name: "Começar conversa" }).click();
  await expect(widget.getByText(/consulta/i).first()).toBeVisible({ timeout: 45_000 }); // visitor speech transcribed
  await widget.getByRole("button", { name: "Encerrar" }).click();
  await expect(widget.getByText("Conversa encerrada. Obrigado!")).toBeVisible({ timeout: 30_000 });
  await page.goto("/painel/ligacoes");
  await expect(page.getByText(/· Site/).first()).toBeVisible();
  await page.goto("/painel/cobranca");
  await expect(page.getByText(/Testes por voz no painel: [1-9]\d* de 60 min/)).toBeVisible();

  expect(erros).toEqual([]);
});
