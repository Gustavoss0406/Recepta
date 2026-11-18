// Full-page reference screenshots + computed-style probe of key elements (reference only, never shipped).
const { chromium } = require("playwright");
(async () => {
  const [url, slug] = process.argv.slice(2);
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const ctx = browser.contexts()[0];
  const out = {};
  for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const page = await ctx.newPage();
    await page.setViewportSize(vp);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);
    const h = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < h; y += 600) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(120); }
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(800);
    await page.screenshot({ path: `screens/${slug}-${name}.png`, fullPage: true });
    out[name] = await page.evaluate(() => {
      const pick = (el) => { if (!el) return null; const s = getComputedStyle(el); const r = el.getBoundingClientRect();
        return { tag: el.tagName, text: (el.innerText || "").trim().slice(0, 60), font: s.fontFamily.slice(0, 80), size: s.fontSize, weight: s.fontWeight, lh: s.lineHeight, ls: s.letterSpacing, color: s.color, bg: s.backgroundColor, radius: s.borderRadius, pad: s.padding, h: Math.round(r.height), w: Math.round(r.width), border: s.border }; };
      const q = (sel) => [...document.querySelectorAll(sel)];
      const btns = q("a,button").filter((e) => /criar|falar|cadastr|começ|experiment|entrar|vendas/i.test(e.innerText || "")).slice(0, 6).map(pick);
      const sections = q("main > *, main section").slice(0, 40).map((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return { tag: e.tagName, h: Math.round(r.height), top: Math.round(r.top + scrollY), bg: s.backgroundColor, pt: s.paddingTop, pb: s.paddingBottom }; });
      const cards = q("main [class*=rounded]").slice(0, 300).map((e) => getComputedStyle(e).borderRadius).reduce((m, r) => (m[r] = (m[r] || 0) + 1, m), {});
      const colors = {}; q("main *").slice(0, 4000).forEach((e) => { const s = getComputedStyle(e); [s.color, s.backgroundColor].forEach((c) => { if (c && c !== "rgba(0, 0, 0, 0)") colors[c] = (colors[c] || 0) + 1; }); });
      const fonts = {}; q("body *").slice(0, 4000).forEach((e) => { const f = getComputedStyle(e).fontFamily.split(",")[0]; fonts[f] = (fonts[f] || 0) + 1; });
      const maxW = q("main *").slice(0, 2000).map((e) => getComputedStyle(e).maxWidth).filter((m) => m.endsWith("px")).reduce((m, r) => (m[r] = (m[r] || 0) + 1, m), {});
      return { body: pick(document.body), header: pick(document.querySelector("header")), h1: pick(document.querySelector("h1")), h2: q("h2").slice(0, 4).map(pick), h3: q("h3").slice(0, 3).map(pick), p: q("main p").slice(0, 3).map(pick), buttons: btns, sections, radii: cards, colors: Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 25), fonts, maxWidths: maxW };
    });
    await page.close();
  }
  require("fs").writeFileSync(`evidence/${slug}-styles.json`, JSON.stringify(out, null, 1));
  console.log("ok", slug);
  await browser.close().catch(() => {});
})();
