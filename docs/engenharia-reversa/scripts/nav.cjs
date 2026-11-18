// Navigate the existing CDP page target to a URL, scroll through it to trigger lazy content, then leave it open for REA.
(async () => {
const { chromium } = require("playwright");
const [url] = process.argv.slice(2);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages()[0];
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
const h = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y < h; y += 700) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(150); }
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(800);
console.log(JSON.stringify({ url: page.url(), title: await page.title(), height: h }));
await browser.close().catch(() => {});
})();
