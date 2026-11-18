// Dump visible text of a page after expanding accordions (reference evidence).
const { chromium } = require("playwright");
(async () => {
  const [url, out] = process.argv.slice(2);
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const page = await browser.contexts()[0].newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  const btns = await page.$$("main h3 button, main [aria-expanded=false]");
  for (const b of btns) {
    try {
      await b.click({ timeout: 1500 });
      await page.waitForTimeout(120);
    } catch {}
  }
  const text = await page.evaluate(() => document.querySelector("main")?.innerText || document.body.innerText);
  require("fs").writeFileSync(out, text);
  console.log(out, text.length);
  await page.close();
  await browser.close().catch(() => {});
})();
