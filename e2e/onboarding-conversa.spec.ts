import { expect, test, type Page } from "@playwright/test";

/**
 * First access as a conversation: a real estate owner talks to the Recepta while the flow builds
 * itself on the canvas. Recorded on video (desktop and phone) for review.
 * E2E_PERSONA picks the script (imobiliaria by default).
 */
const PERSONAS: Record<string, Record<string, string[]>> = {
  imobiliaria: {
    negocio: ["Tenho uma imobiliária, a gente vende e aluga"],
    empresa: ["Imobiliária Lar, aqui em Campinas"],
    servicos: ["Apartamentos e casas de 400 mil a 3 milhões; salas comerciais pra alugar"],
    motivos: ["gente perguntando de imóvel, marcar visita, boleto de aluguel e vistoria de saída"],
    horario: ["seg a sex 9h às 18h, sábado 9 às 13"],
    agenda: ["Sim, pode marcar"],
    fora: ["Marca mesmo assim, e se for vazamento de inquilino tem o plantão (19) 99876-5432"],
    plantao: ["(19) 99876-5432"],
    pessoa: ["Transfere pro (19) 3232-1000"],
    transferir: ["(19) 3232-1000"],
    site: ["imobiliarialar.com.br"],
    recepcionista: ["Lia, bem descontraída"],
    imob_operacao: ["Os dois"],
    imob_regioes: ["Cambuí, Taquaral e Barão Geraldo"],
    imob_alto_padrao: ["Acima de 2 milhões passa direto pro corretor sênior"],
    imob_financiamento: ["Explica o básico"],
    imob_visita: ["Precisa levar documento com foto e ir com o corretor"],
    imob_captacao: ["Quero esses contatos!"],
    imob_inquilino: ["Urgência passa na hora, boleto anota e passa"],
    vip: ["Investidores que já compraram com a gente têm prioridade total"],
    reclamacao: ["O gerente, em até 24h"],
    cancelamento: ["Avisar com 2h de antecedência"],
    desconto: ["Não, nunca"],
    confirmacao: ["Sim, manda"],
    sistemas: ["Kommo"],
    aviso: ["WhatsApp"],
    nunca: ["Nunca prometer aprovação de financiamento"],
    vendedores: ["Sim, dispensa"],
    extra: ["Quando pedirem pra negociar comissão, passa pro gerente", "Quando for permuta, anota e passa pro corretor sênior", "Não, é isso"],
  },
};

async function conversar(page: Page, persona: Record<string, string[]>, fotos: (n: string) => Promise<void>) {
  const fila = Object.fromEntries(Object.entries(persona).map(([k, v]) => [k, [...v]]));
  const raiz = page.getByTestId("onboarding-conversa");
  for (let i = 0; i < 45; i++) {
    if (await page.getByTestId("onboarding-pronto").isVisible()) break;
    const id = (await raiz.getAttribute("data-pergunta")) ?? "";
    const antes = await page.locator('[data-testid="mensagens"] > div').count();
    const resposta = fila[id]?.shift();
    if (resposta) {
      const campo = page.getByLabel("Sua resposta");
      await campo.click();
      await campo.pressSequentially(resposta, { delay: 18 });
      await page.waitForTimeout(250);
      await page.getByRole("button", { name: "Enviar" }).click();
    } else await page.getByRole("button", { name: "Pular" }).click();
    await expect.poll(async () => page.locator('[data-testid="mensagens"] > div').count(), { timeout: 90_000 }).toBeGreaterThan(antes + 1);
    await expect(page.getByLabel("Recepta está pensando")).toHaveCount(0, { timeout: 90_000 });
    await page.waitForTimeout(1600); // let the canvas animate
    if (["negocio", "horario", "imob_alto_padrao", "vip"].includes(id)) await fotos(id);
  }
}

for (const tela of ["desktop", "celular"] as const) {
  test(`onboarding em conversa (${tela})`, async ({ browser }, info) => {
    test.setTimeout(900_000);
    const tamanho = tela === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 };
    const ctx = await browser.newContext({
      baseURL: process.env.E2E_URL ?? "http://localhost:3000",
      viewport: tamanho,
      ...(tela === "celular" ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
      recordVideo: { dir: info.outputPath("video"), size: tamanho },
    });
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(e.message));
    const fotos = async (n: string) => {
      await page.screenshot({ path: info.outputPath(`${tela}-${n}.png`) });
    };
    try {
      await page.goto("/criar-conta");
      await page.getByLabel("Seu nome").fill("Marina Prado");
      await page.getByLabel("E-mail").fill(`onb+${tela}-${Date.now()}@recepta.test`);
      await page.getByLabel("Senha").fill("senhaforte123");
      await page.getByLabel("Nome da empresa").fill("Imobiliária Lar");
      await page.getByRole("button", { name: "Criar conta grátis" }).click();
      await expect(page).toHaveURL(/painel\/comecar/);
      await expect(page.getByTestId("onboarding-conversa")).toBeVisible();
      await page.waitForTimeout(1500);
      await fotos("inicio");
      await conversar(page, PERSONAS[process.env.E2E_PERSONA ?? "imobiliaria"], fotos);
      await expect(page.getByTestId("onboarding-pronto")).toBeVisible();
      const etapas = Number(await page.getByTestId("contador-etapas").getAttribute("data-total"));
      await expect(page.getByTestId("fluxo-vivo")).toHaveAttribute("data-construindo", "nao", { timeout: 60_000 });
      expect(etapas).toBeGreaterThanOrEqual(100);
      await page.waitForTimeout(2500);
      await fotos("pronto");
      if (tela === "celular") {
        await page.getByRole("button", { name: "Ver fluxo" }).click();
        await page.waitForTimeout(1500);
        await fotos("fluxo-expandido");
        await page.getByRole("button", { name: "Voltar à conversa" }).click();
      }
      await page.getByRole("link", { name: "Abrir no editor" }).click();
      await expect(page).toHaveURL(/aba=workflow/);
      await page.waitForTimeout(3000);
      await fotos("editor");
      expect(erros).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
}
